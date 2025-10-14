import sys
import os
import socket
from urllib.parse import unquote, urlparse

if len(sys.argv) != 5:
    print("You need to use the following format: client.py server_host server_port url_path directory")
    sys.exit(1)

HOST = sys.argv[1]
PORT = int(sys.argv[2])
URL_PATH = sys.argv[3]
SAVE_DIR = sys.argv[4]

if not URL_PATH.startswith("/"):
    URL_PATH = "/" + URL_PATH

if not os.path.exists(SAVE_DIR):
    print(f"Directory '{SAVE_DIR}' does not exist.")
    sys.exit(1)


# Determining filename for saving
def filename_from_path(path):
    path = unquote(urlparse(path).path)
    name = os.path.basename(path)
    return name if name else "index.html"


out_path = os.path.join(SAVE_DIR, filename_from_path(URL_PATH))

# HTTP GET request
request = f"GET {URL_PATH} HTTP/1.1\r\nHost: {HOST}\r\nConnection: close\r\n\r\n"

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    try:
        sock.connect((HOST, PORT))
        sock.sendall(request.encode('utf-8'))
    except Exception as e:
        print("Connection error:", e)
        sys.exit(1)

    response = b""
    while True:
        chunk = sock.recv(8192)
        if not chunk:
            break
        response += chunk

# Splitting headers and body
try:
    header_bytes, body = response.split(b"\r\n\r\n", 1)
except ValueError:
    print("Malformed HTTP response.")
    sys.exit(1)

headers = header_bytes.decode('iso-8859-1').splitlines()
status_line = headers[0]

# Checking status code from the server
try:
    status_code = int(status_line.split()[1])
except Exception:
    status_code = None

if status_code != 200:
    print(f"Server returned: {status_line}")
    try:
        print(body.decode('utf-8', errors='replace'))
    except Exception:
        pass
    sys.exit(1)

# Determining content type
content_type = ""
for h in headers[1:]:
    if h.lower().startswith("content-type:"):
        content_type = h.split(":",1)[1].strip().lower()
        break

if content_type.startswith("text") or URL_PATH.endswith((".html")):
    print(body.decode("utf-8", errors="replace"))
elif content_type in ("image/png", "application/pdf") or URL_PATH.endswith((".png", ".pdf")):
    with open(out_path, "wb") as f:
        f.write(body)
    print(f"Saved file to: {out_path}")
else:
    print(f"Unknown content type {content_type}. Not saved.")
    sys.exit(1)
