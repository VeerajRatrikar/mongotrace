import os
import sys
import win32com.client

def convert_docx_to_pdf(docx_path, pdf_path):
    abs_docx = os.path.abspath(docx_path)
    abs_pdf = os.path.abspath(pdf_path)
    
    print(f"[Converting] '{abs_docx}' -> '{abs_pdf}'...")
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    
    try:
        doc = word.Documents.Open(abs_docx)
        # 17 = wdFormatPDF
        doc.SaveAs(abs_pdf, FileFormat=17)
        doc.Close()
        print(f"[Success] PDF generated at: {abs_pdf}")
    except Exception as e:
        print(f"[Error] Failed to convert: {e}")
        sys.exit(1)
    finally:
        word.Quit()

if __name__ == "__main__":
    convert_docx_to_pdf("MongoTrace_Project_Report.docx", "MongoTrace_Project_Report.pdf")
