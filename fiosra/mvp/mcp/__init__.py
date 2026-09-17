"""
Fiosra Custom Model Context Protocol (MCP) Package.
Exposes domain-bounded pedagogical tools for internal agents.
"""
from fiosra.mvp.mcp.server import mcp_server, get_fiosra_mcp_server

__all__ = ["mcp_server", "get_fiosra_mcp_server"]
