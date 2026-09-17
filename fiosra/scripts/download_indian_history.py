import os
import requests
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def download_pdfs():
    """
    Downloads open-access PDFs about Indian History.
    Uses Wikipedia's REST API to fetch comprehensive articles as PDFs.
    """
    target_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "reference", "indian-history")
    os.makedirs(target_dir, exist_ok=True)

    # We use Wikipedia's article-to-PDF API for reliable public domain content
    sources = [
        {
            "name": "History_of_India.pdf",
            "url": "https://en.wikipedia.org/api/rest_v1/page/pdf/History_of_India"
        },
        {
            "name": "Indian_independence_movement.pdf",
            "url": "https://en.wikipedia.org/api/rest_v1/page/pdf/Indian_independence_movement"
        }
    ]

    for source in sources:
        target_path = os.path.join(target_dir, source["name"])
        if os.path.exists(target_path):
            logger.info(f"File {source['name']} already exists. Skipping download.")
            continue
            
        logger.info(f"Downloading {source['name']}...")
        try:
            # Setting a user-agent as required by Wikimedia API policy
            headers = {'User-Agent': 'FiosraTutorBot/1.0 (https://github.com/fiosra/tutor)'}
            response = requests.get(source["url"], headers=headers)
            response.raise_for_status()
            
            with open(target_path, "wb") as f:
                f.write(response.content)
            logger.info(f"Successfully downloaded {source['name']}")
        except Exception as e:
            logger.error(f"Failed to download {source['name']}: {e}")

if __name__ == "__main__":
    download_pdfs()
