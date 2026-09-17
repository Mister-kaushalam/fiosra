import asyncio
import logging
from typing import Any
from fiosra.mvp.graph_service import graph_service

logger = logging.getLogger(__name__)

async def seed_kcs_with_graphiti(kcs: list[dict[str, Any]]):
    """
    Upserts Knowledge Components and their prerequisite edges using the Graphiti SDK
    instead of raw Cypher queries.
    """
    graphiti = graph_service.graphiti
    if not graphiti:
        graph_service.init_graphiti()
        graphiti = graph_service.graphiti
        
    logger.info(f"Seeding {len(kcs)} Knowledge Components with Graphiti...")
    
    # 0. Add Course and Module Nodes
    logger.info("Adding Course and Module Hierarchy...")
    course_id = await graphiti.add_node(
        name="European History 101",
        attributes={"node_type": "Course", "domain": "History"}
    )
    module_id = await graphiti.add_node(
        name="The French Revolution",
        attributes={"node_type": "Module", "domain": "History"}
    )
    
    await graphiti.add_edge(
        source_node_id=course_id,
        target_node_id=module_id,
        relation_type="COMPOSED_OF",
        attributes={}
    )
    
    # 1. Add KC nodes using Graphiti SDK
    kc_node_ids = {}
    for item in kcs:
        # In a real Graphiti setup, we'd use graphiti.add_node
        # Assuming the signature: add_node(name, attributes)
        # We simulate the exact call here for Fiosra's architecture
        logger.debug(f"Adding Graphiti Node: {item['label']} (KC)")
        
        node_id = await graphiti.add_node(
            name=item["label"],
            attributes={
                "kc_id": item["kc_id"],
                "domain": item["domain"],
                "bloom_level": item.get("bloom_level"),
                "description": item.get("description"),
                "node_type": "KnowledgeComponent"
            }
        )
        kc_node_ids[item["kc_id"]] = node_id

    # 2. Add edges using Graphiti SDK
    edges_count = 0
    for item in kcs:
        target_kc = item["kc_id"]
        for prereq_kc in item.get("prerequisite_ids", []):
            logger.debug(f"Adding Graphiti Edge: {target_kc} REQUIRES {prereq_kc}")
            
            source_node_id = kc_node_ids.get(target_kc)
            target_node_id = kc_node_ids.get(prereq_kc)
            
            if source_node_id and target_node_id:
                await graphiti.add_edge(
                    source_node_id=source_node_id,
                    target_node_id=target_node_id,
                    relation_type="REQUIRES",
                    attributes={}
                )
                edges_count += 1
                
        # Link every KC to the module
        if kc_node_ids.get(target_kc):
            await graphiti.add_edge(
                source_node_id=module_id,
                target_node_id=kc_node_ids[target_kc],
                relation_type="COMPOSED_OF",
                attributes={}
            )
                
    logger.info(f"Successfully seeded {len(kcs)} KCs, Hierarchy, and {edges_count} REQUIRES edges via Graphiti.")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Sample KCs for the MVP seed
    sample_kcs = [
        {
            "kc_id": "KC_LANG_READING_COMPREHENSION",
            "label": "Reading Comprehension",
            "domain": "Language",
            "description": "Understanding text",
            "prerequisite_ids": []
        },
        {
            "kc_id": "KC_LANG_ARGUMENT_IDENTIFICATION",
            "label": "Argument Identification",
            "domain": "Language",
            "description": "Identifying the author's argument",
            "prerequisite_ids": ["KC_LANG_READING_COMPREHENSION"]
        }
    ]
    
    asyncio.run(seed_kcs_with_graphiti(sample_kcs))
