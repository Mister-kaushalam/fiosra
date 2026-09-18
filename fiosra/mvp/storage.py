import logging
import os
import re
from pathlib import Path
from uuid import UUID

from fiosra.mvp.config import settings

logger = logging.getLogger(__name__)


class LocalDocumentStorage:
    """Manages local persistent storage for course PDF documents and primary sources."""

    def __init__(self, base_dir: str | None = None):
        self.base_dir = Path(base_dir or settings.STORAGE_DIR).resolve()
        self.documents_dir = self.base_dir / "documents"
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        try:
            self.documents_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            logger.warning(f"Failed to create storage directory {self.documents_dir}: {e}")

    @staticmethod
    def sanitize_filename(filename: str) -> str:
        clean = os.path.basename(filename)
        clean = re.sub(r"[^\w\.\-\s]", "_", clean)
        return clean.strip() or "document.pdf"

    def save_document(
        self,
        course_id: UUID | str,
        document_id: UUID | str,
        filename: str,
        content: bytes,
    ) -> tuple[str, int]:
        """
        Saves raw bytes into storage/documents/{course_id}/{document_id}_{filename}.
        Returns (relative_storage_path, file_size_bytes).
        """
        course_folder = self.documents_dir / str(course_id)
        course_folder.mkdir(parents=True, exist_ok=True)

        safe_filename = self.sanitize_filename(filename)
        target_name = f"{document_id}_{safe_filename}"
        target_path = course_folder / target_name

        target_path.write_bytes(content)
        file_size = len(content)

        relative_path = str(target_path.relative_to(self.base_dir))
        return relative_path, file_size

    def get_document_path(self, file_path: str) -> Path | None:
        """Resolves storage-relative or absolute file path to a real Path if it exists."""
        p = Path(file_path)
        if not p.is_absolute():
            p = self.base_dir / p
        if p.exists() and p.is_file():
            return p
        return None

    def delete_document(self, file_path: str) -> bool:
        """Deletes document file from disk if present."""
        resolved = self.get_document_path(file_path)
        if resolved:
            try:
                resolved.unlink(missing_ok=True)
                return True
            except OSError as e:
                logger.warning(f"Could not delete storage file {resolved}: {e}")
        return False

    delete_file = delete_document

    def delete_course_documents(self, course_id: UUID | str) -> None:
        """Removes the entire storage folder for a given course."""
        import shutil
        course_folder = self.documents_dir / str(course_id)
        if course_folder.exists() and course_folder.is_dir():
            try:
                shutil.rmtree(course_folder)
            except OSError as e:
                logger.warning(f"Could not remove course folder {course_folder}: {e}")


document_storage = LocalDocumentStorage()
