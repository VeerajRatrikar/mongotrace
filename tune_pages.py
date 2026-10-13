import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
import win32com.client
from generate_9page_report import create_full_report

def get_pages(docx_path):
    word = win32com.client.Dispatch('Word.Application')
    doc = word.Documents.Open(docx_path)
    count = doc.ComputeStatistics(2)
    doc.Close()
    word.Quit()
    return count

if __name__ == '__main__':
    create_full_report()
    p = get_pages(r'C:\Users\VEERAJ\OneDrive\Desktop\NoSQL\MongoTrace_Project_Report.docx')
    print('Pages:', p)
