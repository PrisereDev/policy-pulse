"""
PDF service for extracting text and metadata from PDF files.
"""
import logging
from typing import Dict, Any, Optional
import io

# Use pypdf instead of PyPDF2 (pypdf is the modern maintained version)
from pypdf import PdfReader

from pdfalyzer.pdfalyzer import Pdfalyzer
from yaralyzer.yaralyzer import Yaralyzer
from anytree import PreOrderIter


logger = logging.getLogger(__name__)


class PDFService:
    """Service for processing PDF files."""
    def analyze_pdf_from_bytes(pdf_bytes):
        pdf_file_object = io.BytesIO(pdf_bytes)
        logger.info("[*] Checking PDF for malicious content...")
        try:
            # 2. Pass the file object to Pdfalyzer
            analyzer = Pdfalyzer(pdf_file_object)
            pdf_tree = analyzer.pdf_tree
            
            # 3. Check Malicious Tags
            suspicious_tags = ['/JS', '/JavaScript', '/OpenAction', '/Launch']
            
            for node in PreOrderIter(pdf_tree):
                if hasattr(node, 'reference_key') and node.reference_key in suspicious_tags:
                    logger.info(f"[!] Found Suspicious Tag: {node.reference_key}")
                    if hasattr(node, 'blob'):
                        logger.info(f"    -> Preview: {node.blob[:50]}...")
                    raise Exception("PDF is malicious (test)")
        except Exception as e:
            print(f"[-] Failed to analyze bytes: {e}")

    def extract_text_from_bytes(self, pdf_bytes: bytes) -> str:
        """
        Extract text content from PDF bytes.
        
        Args:
            pdf_bytes: PDF file content as bytes
            
        Returns:
            str: Extracted text from all pages
            
        Raises:
            Exception: If PDF is corrupted or cannot be read
        """
        try:
            # Create a file-like object from bytes
            pdf_file = io.BytesIO(pdf_bytes)
            
            # Read PDF
            reader = PdfReader(pdf_file)
            
            # Extract text from all pages
            text_parts = []
            for page_num, page in enumerate(reader.pages, start=1):
                try:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(f"--- Page {page_num} ---\n{page_text}")
                except Exception as e:
                    logger.warning(f"Failed to extract text from page {page_num}: {e}")
                    text_parts.append(f"--- Page {page_num} --- [Error extracting text]")
            
            # Join all text
            full_text = "\n\n".join(text_parts)
            
            logger.info(f"Successfully extracted text from PDF ({len(reader.pages)} pages, {len(full_text)} characters)")
            
            return full_text
            
        except Exception as e:
            logger.error(f"Failed to extract text from PDF: {e}")
            raise Exception(f"Failed to extract text from PDF: {str(e)}")
    
    def get_pdf_metadata(self, pdf_bytes: bytes) -> Dict[str, Any]:
        """
        Extract metadata from PDF bytes.
        
        Args:
            pdf_bytes: PDF file content as bytes
            
        Returns:
            dict: Metadata including page_count, title, author, etc.
            
        Raises:
            Exception: If PDF is corrupted or cannot be read, is malicious
        """
            
        try:
            # Create a file-like object from bytes
            pdf_file = io.BytesIO(pdf_bytes)
            
            # Read PDF
            reader = PdfReader(pdf_file)
            
            # Extract basic metadata
            metadata = {
                "page_count": len(reader.pages),
                "is_encrypted": reader.is_encrypted,
            }
            
            # Extract document info if available
            if reader.metadata:
                # Get common metadata fields
                metadata["title"] = reader.metadata.get("/Title", "")
                metadata["author"] = reader.metadata.get("/Author", "")
                metadata["subject"] = reader.metadata.get("/Subject", "")
                metadata["creator"] = reader.metadata.get("/Creator", "")
                metadata["producer"] = reader.metadata.get("/Producer", "")
                
                # Get creation/modification dates if available
                creation_date = reader.metadata.get("/CreationDate", "")
                if creation_date:
                    metadata["creation_date"] = str(creation_date)
                
                mod_date = reader.metadata.get("/ModDate", "")
                if mod_date:
                    metadata["modification_date"] = str(mod_date)
            
            logger.info(f"Successfully extracted PDF metadata: {metadata['page_count']} pages")
            

            return metadata
            
        except Exception as e:
            logger.error(f"Failed to extract PDF metadata: {e}")
            raise Exception(f"Failed to extract PDF metadata: {str(e)}")
    
    def validate_pdf(self, pdf_bytes: bytes) -> bool:
        """
        Validate that bytes represent a valid PDF file.
        
        Args:
            pdf_bytes: PDF file content as bytes
            
        Returns:
            bool: True if valid PDF, False otherwise
        """
        try:
            pdf_file = io.BytesIO(pdf_bytes)
            reader = PdfReader(pdf_file)
            
            # Check if we can read at least the page count
            page_count = len(reader.pages)
            
            if page_count == 0:
                logger.warning("PDF has 0 pages")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"PDF validation failed: {e}")
            return False
    
    def extract_text_with_metadata(self, pdf_bytes: bytes) -> Dict[str, Any]:
        """
        Extract both text and metadata from PDF.
        
        Args:
            pdf_bytes: PDF file content as bytes
            
        Returns:
            dict: Contains 'text' and 'metadata' keys
        """
        try:
            text = self.extract_text_from_bytes(pdf_bytes)
            metadata = self.get_pdf_metadata(pdf_bytes)
            
            return {
                "text": text,
                "metadata": metadata
            }
            
        except Exception as e:
            logger.error(f"Failed to extract text and metadata: {e}")
            raise


# Global PDF service instance
pdf_service = PDFService()

