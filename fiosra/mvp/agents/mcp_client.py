"""
fiosra/mvp/agents/mcp_client.py
MCP Client Manager for Fiosra Agents.
Allows LangGraph agents to dynamically discover and call tools on the Fiosra FastMCP Server.
"""
from __future__ import annotations

import logging
from typing import Any
from fiosra.mvp.mcp.server import mcp_server

logger = logging.getLogger(__name__)


class AgentMCPClient:
    """
    Client interface enabling agents to execute tools against the Fiosra FastMCP Server.
    """

    def __init__(self, server=None) -> None:
        self.server = server or mcp_server

    async def list_tools(self) -> list[dict[str, Any]]:
        """Lists all registered tools on the FastMCP server."""
        tools = await self.server.list_tools()
        return [
            {
                "name": t.name,
                "description": t.description,
            }
            for t in tools
        ]

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        """
        Executes a named tool with arguments on the MCP server and unwraps the structured payload.
        """
        try:
            res = await self.server.call_tool(tool_name, arguments)
            if res.is_error:
                logger.error(f"MCP tool '{tool_name}' returned error: {res.content}")
                return None
            
            sc = res.structured_content
            if isinstance(sc, dict):
                if "result" in sc:
                    return sc["result"]
                return sc
            return sc
        except Exception as e:
            logger.error(f"Failed to execute MCP tool '{tool_name}': {e}")
            return None


# Global singleton client instance for agents
agent_mcp_client = AgentMCPClient()
