import os
import sys
import socket
import time
import urllib.parse
import threading
import queue

request_counts = {}
request_times_per_ip = {}
lock = threading.Lock()
request_times_lock = threading.Lock()

rate_limit = {}
RATE = 5
TIME_REQ = 1.0


def increment_naive(path):
    import time
    current = request_counts.get(path, 0)
    time.sleep(0.01)
    request_counts[path] = current + 1


def increment_safe(path):
    with lock:
        request_counts[path] = request_counts.get(path, 0) + 1


def generate_directory_listing(directory, request_path):
    items = os.listdir(directory)
    html = """
    <html>
    <head>
        <title>Directory listing</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background: #C0F6FA;
                margin: 40px;
            }
            h2 {
                color: #222;
                border-bottom: 2px solid #0078D7;
                padding-bottom: 5px;
                text-align: center;
                display: block;
                margin: 15px auto; 
                width: fit-content;
            }
            ul {
                list-style-type: none;
                padding: 0;
            }
            li {
                margin: 8px 80px;
                padding: 10px;
                background: white;
                border-radius: 6px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                transition: transform 0.1s ease, background 0.2s ease;
            }
            li:hover {
                background: #eaf4ff;
                transform: scale(1.02);
            }
            a {
                text-decoration: none;
                color: #0C8E97;
                font-weight: bold;
            }
            a:hover {
                text-decoration: underline;
            }
            .footer {
                margin-top: 40px;
                font-size: 0.9em;
                color: #777;
                text-align: center;
            }
        </style>
    </head>
    <body>
    """
    html += f"<h2 style='margin-bottom:25px'>Content of {request_path}</h2><ul>"

    # Adding parent directory link if not at root
    if request_path != "/":
        parent = os.path.dirname(request_path.rstrip('/'))
        if parent == "":
            parent = "/"
        html += f"<li><a href='{parent}' style='color: #3EE3EF;'>Go back to {parent}</a></li>"

    # Directory contents
    for item in items:
        item_path = os.path.join(request_path, item).replace("\\", "/")
        if os.path.isdir(os.path.join(directory, item)):
            full_item_path = os.path.normpath(os.path.join(directory, item))
            count = request_counts.get(full_item_path, 0)
            html += f"""
            <li style="display: flex; justify-content: space-between; align-items: center;">
                <a href='{item_path}/'>{item}/</a>
                <span style="color: #555;">{count}</span>
            </li>
            """
        else:
            full_item_path = os.path.normpath(os.path.join(directory, item))
            count = request_counts.get(full_item_path, 0)
            html += f"""
            <li style="display: flex; justify-content: space-between; align-items: center;">
                <a href='{item_path}'>{item}</a>
                <span style="color: #555;">{count}</span>
            </li>
            """

    html += "</ul>"
    html += "</body></html>"
    return html


def get_content_type(filename):
    if filename.endswith(".html"):
        return "text/html"
    elif filename.endswith(".png"):
        return "image/png"
    elif filename.endswith(".pdf"):
        return "application/pdf"
    else:
        return None


def client_request(connection, address, serve_root):
    message = connection.recv(4096).decode()
    if not message:
        connection.close()
        return

    request_line = message.splitlines()[0]
    parts = request_line.split()
    if len(parts) < 2:
        connection.close()
        return

    method, path = parts[0], parts[1]

    client_ip = address[0]
    now = time.time()

    with request_times_lock:
        if client_ip not in request_times_per_ip:
            request_times_per_ip[client_ip] = []

        request_times_per_ip[client_ip] = [t for t in request_times_per_ip[client_ip] if now - t < TIME_REQ]

        if len(request_times_per_ip[client_ip]) >= RATE:
            body = ("<!doctype html><html><head><meta charset='utf-8'><title>403 Forbidden</title>"
                    "<style>body{background:#C0F6FA;margin:0;padding:80px;font-family:Arial;text-align:center;color:#1f2937}"
                    "h1{margin:0 0 8px 0}</style></head><body>"
                    "<h1>429 Too Many Requests</h1>"
                    "<p>You should not exceed the limit of 5 requests/sec.</p>"
                    "</body></html>")
            header = "HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/html\r\n\r\n"
            connection.sendall((header + body).encode())
            connection.close()
        request_times_per_ip[client_ip].append(now)

    if method != "GET":
        response = "HTTP/1.1 501 Not Implemented\r\n\r\n"
        connection.sendall(response.encode())
        connection.close()
        return

    path = urllib.parse.unquote(path)
    if path == "/":
        requested_path = serve_root
    else:
        requested_path = os.path.normpath(os.path.join(serve_root, path.lstrip("/")))

    time.sleep(1.0)
    if not requested_path.startswith(serve_root):
        body = ("<!doctype html><html><head><meta charset='utf-8'><title>403 Forbidden</title>"
                "<style>body{background:#C0F6FA;margin:0;padding:80px;font-family:Arial;text-align:center;color:#1f2937}"
                "h1{margin:0 0 8px 0}</style></head><body>"
                "<h1>403 Forbidden</h1>"
                "<p>You don't have permission to access this resource.</p>"
                "</body></html>")
        header = "HTTP/1.1 403 Forbidden\r\nContent-Type: text/html\r\n\r\n"
        connection.sendall((header + body).encode())
        connection.close()
        return

    if os.path.isdir(requested_path):
        # increment_naive(requested_path)  # for demonstrating race condition

        increment_safe(requested_path)  # for safe synchronized counter

        body = generate_directory_listing(requested_path, path)
        header = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n"
        connection.sendall((header + body).encode())
        connection.close()
        return

    if os.path.exists(requested_path):
        # increment_naive(requested_path)  # for demonstrating race condition

        increment_safe(requested_path)  # for safe synchronized counter

        content_type = get_content_type(requested_path)
        if content_type is None:
            body = ("<!doctype html><html><head><meta charset='utf-8'><title>404 Not Found</title>"
                    "<style>body{background:#C0F6FA;margin:0;padding:80px;font-family:Arial;text-align:center;color:#1f2937}"
                    "h1{margin:0 0 8px 0}</style></head><body>"
                    "<h1>404 Not Found</h1>"
                    "<p>Unknown file type.</p>"
                    "</body></html>")
            header = "HTTP/1.1 404 Not Found\r\nContent-Type: text/html\r\n\r\n"
            connection.sendall((header + body).encode())
            connection.close()
            return


        if content_type.startswith("text/"):
            with open(requested_path, "r", encoding="utf-8") as f:
                data = f.read().encode()
        else:
            with open(requested_path, "rb") as f:
                data = f.read()

        header = "HTTP/1.1 200 OK\r\n"
        header += f"Content-Type: {content_type}\r\n"
        header += f"Content-Length: {len(data)}\r\n"
        header += "Connection: close\r\n\r\n"

        connection.sendall(header.encode())
        connection.sendall(data)
        connection.close()
        return

    else:
        body = ("<!doctype html><html><head><meta charset='utf-8'><title>404 Not Found</title>"
                "<style>body{background:#C0F6FA;margin:0;padding:80px;font-family:Arial;text-align:center;color:#1f2937}"
                "h1{margin:0 0 8px 0}</style></head><body>"
                "<h1>404 Not Found</h1>"
                "<p>The requested file was not found on this server.</p>"
                "</body></html>")
        header = "HTTP/1.1 404 Not Found\r\nContent-Type: text/html\r\n\r\n"
        connection.send((header + body).encode())
        connection.close()


def worker_loop(conn_queue, serve_root):
    while True:
        conn, addr = conn_queue.get()
        try:
            client_request(conn, addr, serve_root)
        except Exception:
            try:
                conn.close()
            except Exception:
                pass
        finally:
            conn_queue.task_done()


if len(sys.argv) < 3:
    print("You need to use the following format: sever.py directory port")
    sys.exit(1)

directory = sys.argv[1]

if not os.path.exists(directory):
    print(f"This directory {directory} does not exist")
    sys.exit(1)

port = int(sys.argv[2])

directory = os.path.abspath(directory)
SERVE_ROOT = os.path.abspath(directory)

serverSocket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
serverSocket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
serverSocket.bind(("", port))
serverSocket.listen(5)

print(f"Serving {directory} on http://{'' if '' else 'localhost'}:{port}")


N_WORKERS = 10
conn_queue = queue.Queue()

for i in range(N_WORKERS):
    t = threading.Thread(target=worker_loop, args=(conn_queue, SERVE_ROOT), daemon=True)
    t.start()

try:
    while True:
        connection, address = serverSocket.accept()
        conn_queue.put((connection, address))

except KeyboardInterrupt:
    print("\nShutting down server...")

finally:
    try:
        serverSocket.close()
    except Exception:
        pass

    sys.exit()