import html
import os
import sys
import socket
import time
import urllib.parse


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
            html += f"<li><a href='{item_path}/'>{item}/</a></li>"
        else:
            html += f"<li><a href='{item_path}'>{item}</a></li>"

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


host = ""
SERVE_ROOT = os.getcwd()

if len(sys.argv) < 3:
    print("You need to use the following format: sever.py directory port")
    sys.exit(1)

directory = sys.argv[1]

if not os.path.exists(directory):
    print(f"This directory {directory} does not exist")
    sys.exit(1)

port = int(sys.argv[2])

directory = os.path.abspath(directory)

serverSocket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
serverSocket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
serverSocket.bind((host, port))
serverSocket.listen(5)

print(f"Serving {directory} on http://{host}:{port}")


while True:
    connection, address = serverSocket.accept()

    try:
        message = connection.recv(4096).decode()
        if not message:
            connection.close()
            continue

        request_line = message.splitlines()[0]
        parts = request_line.split()
        if len(parts) < 2:
            connection.close()
            continue

        method, path = parts[0], parts[1]
        if method != "GET":
            response = "HTTP/1.1 501 Not Implemented\r\n\r\n"
            connection.send(response.encode())
            connection.close()
            continue

        path = urllib.parse.unquote(path)
        if path == "/":
            requested_path = SERVE_ROOT
        else:
            requested_path = os.path.normpath(os.path.join(SERVE_ROOT, path.lstrip("/")))

        time.sleep(1.0)
        # Preventing directory traversal
        if not requested_path.startswith(SERVE_ROOT):
            body = ("<!doctype html><html><head><meta charset='utf-8'><title>403 Forbidden</title>"
                    "<style>body{background:#C0F6FA;margin:0;padding:80px;font-family:Arial;text-align:center;color:#1f2937}"
                    "h1{margin:0 0 8px 0}</style></head><body>"
                    "<h1>403 Forbidden</h1>"
                    "<p>You don't have permission to access this resource.</p>"
                    "</body></html>")
            header = "HTTP/1.1 403 Forbidden\r\nContent-Type: text/html\r\n\r\n"
            connection.send((header + body).encode())
            connection.close()
            continue

        # If it's a directory, list contents
        if os.path.isdir(requested_path):
            body = generate_directory_listing(requested_path, path)
            header = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n"
            connection.send((header + body).encode())
            connection.close()
            continue

        # If file exists
        if os.path.exists(requested_path):
            content_type = get_content_type(requested_path)
            if content_type is None:
                # Unknown file type
                body = ("<!doctype html><html><head><meta charset='utf-8'><title>404 Not Found</title>"
                        "<style>body{background:#C0F6FA;margin:0;padding:80px;font-family:Arial;text-align:center;color:#1f2937}"
                        "h1{margin:0 0 8px 0}</style></head><body>"
                        "<h1>404 Not Found</h1>"
                        "<p>Unknown file type.</p>"
                        "</body></html>")
                header = "HTTP/1.1 404 Not Found\r\nContent-Type: text/html\r\n\r\n"
                connection.send((header + body).encode())
                connection.close()
                continue

            # Read file content
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

            connection.send(header.encode())
            connection.send(data)
            connection.close()

        else:
            # File not found
            body = ("<!doctype html><html><head><meta charset='utf-8'><title>404 Not Found</title>"
                    "<style>body{background:#C0F6FA;margin:0;padding:80px;font-family:Arial;text-align:center;color:#1f2937}"
                    "h1{margin:0 0 8px 0}</style></head><body>"
                    "<h1>404 Not Found</h1>"
                    "<p>The requested file was not found on this server.</p>"
                    "</body></html>")
            header = "HTTP/1.1 404 Not Found\r\nContent-Type: text/html\r\n\r\n"
            connection.send((header + body).encode())
            connection.close()

    except Exception as e:
        body = ("<!doctype html><html><head><meta charset='utf-8'><title>500 Internal Server Error</title>"
                "<style>body{background:#C0F6FA;margin:0;padding:60px;font-family:Arial;text-align:center;color:#1f2937}"
                "h1{margin:0 0 12px 0}</style></head><body>"
                "<h1>500 Internal Server Error</h1>"
                f"<pre style='display:inline-block;text-align:left;background:#fff;padding:12px;border-radius:6px;max-width:90%;overflow:auto'>{html.escape(str(e))}</pre>"
                "</body></html>")
        header = "HTTP/1.1 500 Internal Server Error\r\nContent-Type: text/html\r\n\r\n"
        connection.send((header + body).encode())
        connection.close()

serverSocket.close()
sys.exit()
