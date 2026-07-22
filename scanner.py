import ctypes
import socket
import struct
import subprocess
import threading
import ipaddress
import time
import urllib.request
import re
import csv
import json
import sys
import ssl

# Enable ANSI escape sequences for Windows console
def enable_ansi():
    if sys.platform == 'win32':
        kernel32 = ctypes.windll.kernel32
        # ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004
        # STD_OUTPUT_HANDLE = -11 (Standard Output)
        handle = kernel32.GetStdHandle(-11)
        mode = ctypes.c_ulong()
        if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            kernel32.SetConsoleMode(handle, mode.value | 0x0004)

# ANSI styles
CLR_RESET = "\033[0m"
CLR_BOLD = "\033[1m"
CLR_CYAN = "\033[36m"
CLR_GREEN = "\033[32m"
CLR_YELLOW = "\033[33m"
CLR_RED = "\033[31m"
CLR_DIM = "\033[2m"

# Common MAC OUI prefixes mapped to vendors (Offline fallbacks)
OFFLINE_VENDORS = {
    "00:00:5E": "IANA",
    "00:05:CD": "Cisco",
    "00:0C:29": "VMware",
    "00:11:32": "Synology",
    "00:14:22": "Dell",
    "00:15:5D": "Microsoft (Hyper-V)",
    "00:1A:11": "Google",
    "00:1C:42": "Parallels",
    "00:25:90": "Supermicro",
    "00:90:F5": "CLEVO",
    "04:18:D6": "Ubiquiti",
    "04:D4:C4": "Intel",
    "04:D9:F5": "ASUS",
    "08:00:27": "VirtualBox",
    "08:60:6E": "ASUS",
    "10:7B:44": "ASUS",
    "18:B4:30": "Nest Labs",
    "1C:69:7A": "Dell",
    "24:4B:FE": "Intel",
    "28:D2:44": "Intel",
    "2C:F4:C5": "Espressif",
    "30:FD:38": "Espressif",
    "34:97:F6": "TP-Link",
    "3C:7C:3F": "Intel",
    "3C:D9:2B": "HP",
    "40:A3:6C": "Apple",
    "44:AF:28": "Intel",
    "48:2C:A0": "Intel",
    "50:9A:4C": "Intel",
    "50:C7:BF": "TP-Link",
    "54:AF:97": "Apple",
    "54:B2:03": "Intel",
    "54:E1:AD": "Intel",
    "60:F2:62": "Intel",
    "70:4D:7B": "Intel",
    "70:85:C2": "Intel",
    "70:CD:0D": "Intel",
    "70:EE:50": "Apple",
    "74:04:F1": "Apple",
    "74:0E:A4": "Apple",
    "74:83:C2": "Apple",
    "78:84:3C": "Intel",
    "7C:8B:CA": "Intel",
    "80:7A:BF": "Raspberry Pi",
    "80:A5:89": "Intel",
    "80:FA:5B": "Intel",
    "84:F3:EB": "Espressif",
    "8C:16:45": "Intel",
    "94:E9:79": "Intel",
    "A0:C5:89": "Intel",
    "A4:38:CC": "Intel",
    "A4:4E:31": "Intel",
    "A4:77:33": "Xiaomi",
    "A8:A1:59": "Intel",
    "B0:52:16": "Intel",
    "B4:B6:76": "Intel",
    "B8:27:EB": "Raspberry Pi",
    "B8:AE:ED": "Intel",
    "C0:2E:5F": "TP-Link",
    "C4:9E:C0": "Intel",
    "C8:D7:19": "TP-Link",
    "CC:96:E5": "Intel",
    "D4:3B:04": "Intel",
    "D8:3A:DD": "Raspberry Pi",
    "DC:A6:32": "Raspberry Pi",
    "E4:5F:01": "Raspberry Pi",
    "E4:A8:DF": "Intel",
    "F0:18:98": "Apple",
    "F4:4E:B4": "Gigabyte Technology",
    "F4:6A:DD": "TP-Link",
    "F8:75:A4": "Intel",
    "FC:F8:AE": "Intel",
}

def ip_to_int(ip):
    return struct.unpack("<I", socket.inet_aton(ip))[0]

def send_arp(ip_str):
    """Sends an ARP request using Windows SendARP API."""
    iphlpapi = ctypes.windll.Iphlpapi
    dst_ip = ip_to_int(ip_str)
    src_ip = 0
    mac_addr = ctypes.create_string_buffer(6)
    mac_len = ctypes.c_ulong(6)
    
    res = iphlpapi.SendARP(dst_ip, src_ip, mac_addr, ctypes.byref(mac_len))
    if res == 0:
        return ":".join(f"{b:02X}" for b in mac_addr.raw)
    return None

def is_randomized_mac(mac):
    """Checks if the MAC address is locally administered (randomized/private)."""
    second_char = mac[1].upper()
    return second_char in ('2', '3', '6', '7', 'A', 'B', 'E', 'F')

def get_mac_vendor(mac):
    """Retrieves the vendor name offline or fallback to online lookup."""
    if is_randomized_mac(mac):
        return "Private/Randomized MAC"
    
    # Try offline lookup
    oui = mac[:8].upper() # Format: XX:XX:XX
    if oui in OFFLINE_VENDORS:
        return OFFLINE_VENDORS[oui]
    
    # Try online lookup with short timeout
    try:
        clean_oui = mac.replace(":", "").replace("-", "")[:6].upper()
        url = f"https://api.macvendors.com/{clean_oui}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=1.0) as response:
            return response.read().decode('utf-8').strip()
    except Exception:
        pass
    
    return "Unknown Vendor"

def get_netbios_name(ip):
    """Queries NetBIOS Node Status (UDP 137) to get the host's workstation name."""
    query = b'\x9f\x7b\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00 \x43\x4b' + b'\x41' * 30 + b'\x00\x00\x21\x00\x01'
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(0.3)
    try:
        sock.sendto(query, (ip, 137))
        data, _ = sock.recvfrom(1024)
        if len(data) > 56:
            num_names = data[56]
            offset = 57
            names = []
            for _ in range(num_names):
                if offset + 18 <= len(data):
                    name_bytes = data[offset:offset+15]
                    name_type = data[offset+15]
                    name = "".join(chr(b) for b in name_bytes if 32 <= b < 127).strip()
                    if name:
                        names.append((name, name_type))
                    offset += 18
            for name, ntype in names:
                if ntype == 0x00: # Workstation service / Computer Name
                    return name
            if names:
                return names[0][0]
    except Exception:
        pass
    finally:
        sock.close()
    return None

def get_dns_name(ip):
    """Performs reverse DNS lookup."""
    try:
        name, _, _ = socket.gethostbyaddr(ip)
        return name
    except (socket.herror, Exception):
        return None

def get_http_title(ip, port):
    """Fetches HTTP Title or Server header from open ports (80/443/8080)."""
    scheme = "https" if port == 443 else "http"
    url = f"{scheme}://{ip}:{port}"
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=1.0, context=ctx) as response:
            html = response.read(4096)
            title_match = re.search(b'<title>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
            title = ""
            if title_match:
                title = title_match.group(1).decode('utf-8', errors='ignore').strip()
                title = re.sub(r'\s+', ' ', title)
            server = response.headers.get('Server', '')
            if title and server:
                return f"HTTP Title: '{title}' (Server: {server})"
            elif title:
                return f"HTTP Title: '{title}'"
            elif server:
                return f"HTTP Web Server: {server}"
            return f"HTTP Web Port Open"
    except Exception:
        pass
    return None

def get_ssh_banner(ip, port=22):
    """Grabs SSH daemon banner on port 22."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.0)
        s.connect((ip, port))
        banner = s.recv(1024).decode('utf-8', errors='ignore').strip()
        s.close()
        if banner:
            clean_banner = banner.split('\n')[0].strip()
            return f"SSH: {clean_banner}"
    except Exception:
        pass
    return None

def get_extra_info(ip):
    """Scans key service ports to grab extra device details/fingerprints."""
    # Ports to scan: 80, 443, 8080, 22
    info_parts = []
    
    # Check HTTP/HTTPS
    for port in (80, 443, 8080):
        res = get_http_title(ip, port)
        if res:
            info_parts.append(res)
            break # only display one HTTP server info if multiple are open
            
    # Check SSH
    ssh_res = get_ssh_banner(ip, 22)
    if ssh_res:
        info_parts.append(ssh_res)
        
    return " | ".join(info_parts) if info_parts else ""

def get_local_networks():
    """Detects active subnet prefixes using ipconfig and fallback routines."""
    networks = []
    try:
        output = subprocess.check_output("ipconfig", shell=True, text=True)
        current_ip = None
        current_mask = None
        for line in output.splitlines():
            line = line.strip()
            if line.startswith("IPv4 Address"):
                # ipconfig appends a status suffix like "192.168.1.5(Preferred)".
                # Strip everything from the "(" so the address parses cleanly.
                current_ip = line.split(":")[-1].strip().split("(")[0].strip()
            elif line.startswith("Subnet Mask"):
                current_mask = line.split(":")[-1].strip()
                if current_ip and current_mask:
                    try:
                        net = ipaddress.IPv4Interface(f"{current_ip}/{current_mask}").network
                        if not net.is_loopback and not net.is_link_local:
                            networks.append(net)
                    except Exception:
                        pass
                    current_ip = None
                    current_mask = None
    except Exception:
        pass
    
    if not networks:
        # Fallback to routing IP address and guess a standard /24 network
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            net = ipaddress.IPv4Interface(f"{ip}/255.255.255.0").network
            networks.append(net)
        except Exception:
            pass
            
    return list(set(networks))

def scan_ip_worker(ip_str, results_list, results_lock):
    """Worker function to check an IP, resolve info, and store it."""
    mac = send_arp(ip_str)
    if not mac:
        return
        
    # Step 1: Resolve Hostname (NetBIOS first, then DNS)
    name = get_netbios_name(ip_str)
    if not name:
        name = get_dns_name(ip_str)
    if not name:
        name = "Unknown Device"
        
    # Step 2: Resolve Vendor
    vendor = get_mac_vendor(mac)
    
    # Step 3: Check extra info (banners/ports)
    extra = get_extra_info(ip_str)
    
    device_info = {
        "ip": ip_str,
        "mac": mac,
        "vendor": vendor,
        "name": name,
        "extra": extra
    }
    
    with results_lock:
        results_list.append(device_info)
        # Print a live update
        print(f"  {CLR_GREEN}[+]{CLR_RESET} Found active device: {CLR_BOLD}{ip_str:<15}{CLR_RESET} | {name:<22} | {vendor}")

def run_scanner():
    enable_ansi()
    
    print(f"\n{CLR_CYAN}{CLR_BOLD}==================================================")
    print("      ALL-DEVICES NETWORK CONTROLLER SCANNER      ")
    print(f"=================================================={CLR_RESET}\n")
    
    networks = get_local_networks()
    if not networks:
        print(f"{CLR_RED}[!] Error: Could not determine any active network subnets to scan.{CLR_RESET}")
        return
        
    print(f"{CLR_BOLD}Target subnets detected:{CLR_RESET} " + ", ".join(f"{CLR_CYAN}{net}{CLR_RESET}" for net in networks))
    print(f"{CLR_DIM}Scanning subnets. This might take a few seconds...{CLR_RESET}\n")
    
    all_results = []
    results_lock = threading.Lock()
    
    start_time = time.time()
    
    for net in networks:
        threads = []
        hosts = list(net.hosts()) if net.num_addresses > 2 else list(net)
        
        for host in hosts:
            ip_str = str(host)
            t = threading.Thread(target=scan_ip_worker, args=(ip_str, all_results, results_lock))
            t.start()
            threads.append(t)
            
            # Rate limit thread pool spawning to 80 active threads to avoid socket exhaustion
            if len(threads) >= 80:
                for th in threads:
                    th.join()
                threads = []
                
        # Join any remaining threads for this network
        for th in threads:
            th.join()
            
    scan_duration = time.time() - start_time
    
    # Map connected results for easy lookup
    connected_map = {dev["ip"]: dev for dev in all_results}
    full_ip_list = []
    
    for net in networks:
        for ip in net:
            ip_str = str(ip)
            if ip == net.network_address:
                full_ip_list.append({
                    "ip": ip_str,
                    "mac": "-",
                    "vendor": "-",
                    "name": "[Network Identifier]",
                    "extra": "Subnet ID (Cannot be assigned)",
                    "status": "Network ID"
                })
            elif ip == net.broadcast_address:
                full_ip_list.append({
                    "ip": ip_str,
                    "mac": "-",
                    "vendor": "-",
                    "name": "[Broadcast Address]",
                    "extra": "Subnet Broadcast (Cannot be assigned)",
                    "status": "Broadcast ID"
                })
            elif ip_str in connected_map:
                dev = connected_map[ip_str]
                full_ip_list.append({
                    "ip": ip_str,
                    "mac": dev["mac"],
                    "vendor": dev["vendor"],
                    "name": dev["name"],
                    "extra": dev["extra"],
                    "status": "Connected"
                })
            else:
                full_ip_list.append({
                    "ip": ip_str,
                    "mac": "-",
                    "vendor": "-",
                    "name": "-",
                    "extra": "Available",
                    "status": "Offline"
                })

    # Format & print results
    print(f"\n{CLR_CYAN}{CLR_BOLD}==================================== SCAN RESULTS ===================================={CLR_RESET}")
    print(f"Scan complete: {len(all_results)} active devices found in {scan_duration:.2f} seconds.\n")
    
    # Draw a table with Status column added
    col_widths = {
        "ip": 15,
        "status": 14,
        "mac": 17,
        "vendor": 22,
        "name": 22,
        "extra": 30
    }
    
    # Table headers using ASCII characters to prevent UnicodeEncodeError in Windows command prompt
    border_top = f"+{'-'*col_widths['ip']}+{'-'*col_widths['status']}+{'-'*col_widths['mac']}+{'-'*col_widths['vendor']}+{'-'*col_widths['name']}+{'-'*col_widths['extra']}+"
    border_mid = f"+{'-'*col_widths['ip']}+{'-'*col_widths['status']}+{'-'*col_widths['mac']}+{'-'*col_widths['vendor']}+{'-'*col_widths['name']}+{'-'*col_widths['extra']}+"
    border_bot = f"+{'-'*col_widths['ip']}+{'-'*col_widths['status']}+{'-'*col_widths['mac']}+{'-'*col_widths['vendor']}+{'-'*col_widths['name']}+{'-'*col_widths['extra']}+"
    
    # Try to reconfigure stdout to UTF-8 to handle any unicode device names
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    print(border_top)
    print(f"| {'IP Address':<{col_widths['ip']-1}}| {'Status':<{col_widths['status']-1}}| {'MAC Address':<{col_widths['mac']-1}}| {'Vendor':<{col_widths['vendor']-1}}| {'Hostname':<{col_widths['name']-1}}| {'Extra Info':<{col_widths['extra']-1}}|")
    print(border_mid)
    
    for dev in full_ip_list:
        # truncate fields to prevent row wrap
        ip_f = dev["ip"][:col_widths["ip"]-1]
        status_f = dev["status"][:col_widths["status"]-1]
        mac_f = dev["mac"][:col_widths["mac"]-1]
        
        vendor_f = dev["vendor"]
        if len(vendor_f) >= col_widths["vendor"]:
            vendor_f = vendor_f[:col_widths["vendor"]-4] + "..."
            
        name_f = dev["name"]
        if len(name_f) >= col_widths["name"]:
            name_f = name_f[:col_widths["name"]-4] + "..."
            
        extra_f = dev["extra"]
        if len(extra_f) >= col_widths["extra"]:
            extra_f = extra_f[:col_widths["extra"]-4] + "..."
            
        # Color-code based on status
        if dev["status"] == "Connected":
            status_color = CLR_GREEN + CLR_BOLD
            ip_color = CLR_BOLD
            name_color = CLR_GREEN
            extra_color = CLR_YELLOW
        elif dev["status"] in ("Network ID", "Broadcast ID"):
            status_color = CLR_CYAN + CLR_BOLD
            ip_color = CLR_CYAN
            name_color = CLR_CYAN
            extra_color = CLR_CYAN + CLR_DIM
        else: # Offline
            status_color = CLR_DIM
            ip_color = CLR_DIM
            name_color = CLR_DIM
            extra_color = CLR_DIM
            
        print(f"| {ip_color}{ip_f:<{col_widths['ip']-1}}{CLR_RESET}| {status_color}{status_f:<{col_widths['status']-1}}{CLR_RESET}| {ip_color if dev['status'] != 'Offline' else CLR_DIM}{mac_f:<{col_widths['mac']-1}}{CLR_RESET}| {ip_color if dev['status'] != 'Offline' else CLR_DIM}{vendor_f:<{col_widths['vendor']-1}}{CLR_RESET}| {name_color}{name_f:<{col_widths['name']-1}}{CLR_RESET}| {extra_color}{extra_f:<{col_widths['extra']-1}}{CLR_RESET}|")
        
    print(border_bot)
    
    # Save reports to files (saving full list including offline)
    csv_file = "network_scan_report.csv"
    try:
        with open(csv_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["IP Address", "Status", "MAC Address", "Vendor", "Hostname", "Extra Info"])
            for dev in full_ip_list:
                writer.writerow([dev["ip"], dev["status"], dev["mac"], dev["vendor"], dev["name"], dev["extra"]])
        print(f"\n[i] CSV Report saved to: {CLR_CYAN}{csv_file}{CLR_RESET}")
    except Exception as e:
        print(f"\n{CLR_RED}[!] Error saving CSV report: {e}{CLR_RESET}")
        
    json_file = "network_scan_report.json"
    try:
        with open(json_file, "w", encoding="utf-8") as f:
            json.dump(full_ip_list, f, indent=4)
        print(f"[i] JSON Report saved to: {CLR_CYAN}{json_file}{CLR_RESET}")
    except Exception as e:
        print(f"{CLR_RED}[!] Error saving JSON report: {e}{CLR_RESET}")

if __name__ == "__main__":
    try:
        run_scanner()
    except KeyboardInterrupt:
        print(f"\n{CLR_RED}[!] Scan aborted by user.{CLR_RESET}")
        sys.exit(0)
