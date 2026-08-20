import http.server
import socketserver
import webbrowser
import socket
import sys

PORT = 8000
MAX_PORT_ATTEMPTS = 20

def find_available_port(start_port):
    port = start_port
    while port < start_port + MAX_PORT_ATTEMPTS:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                port += 1
    return None

def main():
    port = find_available_port(PORT)
    if not port:
        print("Error: Could not find an available port to start the server.")
        sys.exit(1)

    Handler = http.server.SimpleHTTPRequestHandler
    
    # Enable clean URLs by mapping extensionless requests to .html files
    # to mimic production Vercel configuration
    class CleanURLHandler(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            # If the path has no extension and is not a directory, try appending .html
            path = self.translate_path(self.path)
            import os
            if not os.path.exists(path) and not os.path.splitext(path)[1]:
                html_path = path + ".html"
                if os.path.exists(html_path):
                    self.path = self.path + ".html"
            return super().do_GET()

    print("=" * 60)
    print("           TWINANALYTIC LOCAL DEVELOPMENT SERVER")
    print("=" * 60)
    
    url = f"http://localhost:{port}"
    print(f"[*] Starting local server at: {url}")
    print("[*] Press Ctrl+C to stop the server.")
    print("=" * 60)

    # Open the browser in a separate thread/process style (webbrowser is non-blocking)
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"[!] Could not open browser automatically: {e}")

    try:
        # Threaded: a single-threaded server stalls the whole site whenever a
        # browser holds a keep-alive connection open.
        class DevServer(socketserver.ThreadingTCPServer):
            daemon_threads = True
            allow_reuse_address = True

        with DevServer(("127.0.0.1", port), CleanURLHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[+] Server stopped successfully.")
    except Exception as e:
        print(f"\n[!] Server error: {e}")

if __name__ == '__main__':
    main()
