#!/usr/bin/env python3
"""
HTTP Server for Neuro-Memory-Agent
Exposes memory operations via REST API instead of stdio MCP

This allows running as a persistent background service.
"""

import json
import sys
import os
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Import the core memory logic
from mcp_server import handle_request

# Global state
request_id_counter = 0
lock = threading.Lock()

def get_next_id():
    global request_id_counter
    with lock:
        request_id_counter += 1
        return str(request_id_counter)

class NeuroMemoryHTTPHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress default logging
        pass
    
    def send_json_response(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_GET(self):
        parsed = urlparse(self.path)
        
        if parsed.path == '/health':
            self.send_json_response({
                'status': 'healthy',
                'pid': os.getpid()
            })
        elif parsed.path == '/stats':
            # Forward to handle_request
            request_id = get_next_id()
            request = {'id': request_id, 'method': 'get_stats', 'params': {}}
            try:
                response = handle_request(request)
                self.send_json_response(response.get('result', {}))
            except Exception as e:
                self.send_json_response({'error': str(e)}, 500)
        else:
            self.send_json_response({'error': 'Not found'}, 404)
    
    def do_POST(self):
        parsed = urlparse(self.path)
        
        if parsed.path == '/rpc':
            # MCP-compatible RPC endpoint
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            try:
                request = json.loads(body.decode())
                response = handle_request(request)
                self.send_json_response(response)
            except json.JSONDecodeError as e:
                self.send_json_response({
                    'id': None,
                    'error': f'Invalid JSON: {e}'
                }, 400)
            except Exception as e:
                self.send_json_response({
                    'id': request.get('id') if 'request' in dir() else None,
                    'error': str(e)
                }, 500)
        
        elif parsed.path == '/store':
            # Simplified store endpoint
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            try:
                data = json.loads(body.decode())
                request_id = get_next_id()
                request = {
                    'id': request_id,
                    'method': 'store_memory',
                    'params': {
                        'content': data.get('content'),
                        'metadata': data.get('metadata', {})
                    }
                }
                response = handle_request(request)
                self.send_json_response(response.get('result', {}))
            except Exception as e:
                self.send_json_response({'error': str(e)}, 500)
        
        elif parsed.path == '/retrieve':
            # Simplified retrieve endpoint
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            try:
                data = json.loads(body.decode())
                request_id = get_next_id()
                request = {
                    'id': request_id,
                    'method': 'retrieve_memories',
                    'params': {
                        'query': data.get('query'),
                        'k': data.get('k', 5)
                    }
                }
                response = handle_request(request)
                self.send_json_response(response.get('result', []))
            except Exception as e:
                self.send_json_response({'error': str(e)}, 500)
        
        else:
            self.send_json_response({'error': 'Not found'}, 404)

def run_server(host='127.0.0.1', port=8765):
    server = HTTPServer((host, port), NeuroMemoryHTTPHandler)
    print(f"Neuro-Memory HTTP Server starting on http://{host}:{port}", file=sys.stderr)
    print(f"PID: {os.getpid()}", file=sys.stderr)
    sys.stderr.flush()
    
    # Write PID file
    pid_file = "/tmp/neuro-memory-http.pid"
    with open(pid_file, 'w') as f:
        f.write(str(os.getpid()))
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...", file=sys.stderr)
        server.shutdown()
    finally:
        if os.path.exists(pid_file):
            os.remove(pid_file)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Neuro-Memory HTTP Server')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8765, help='Port to listen on')
    args = parser.parse_args()
    
    run_server(args.host, args.port)
