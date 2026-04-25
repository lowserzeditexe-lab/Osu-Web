"""Shim that replaces the Python uvicorn process with the Node.js backend.

The supervisor launches `uvicorn server:app` on port 8001. Because this module is
imported by uvicorn at startup, we use os.execvp to replace the current process
with the Node.js Express backend. Uvicorn never gets a chance to bind the port;
Node takes over the process and listens on 8001 instead.
"""
import os
import sys

NODE_BACKEND_DIR = "/app/backend-node"

os.chdir(NODE_BACKEND_DIR)

sys.stdout.flush()
sys.stderr.flush()
os.execvp("node", ["node", "server.js"])
