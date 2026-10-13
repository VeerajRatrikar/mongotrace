import docx
from docx import Document
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls
import win32com.client

doc = Document()
sect = doc.sections[0]
xml_str = f'<w:pgBorders {nsdecls("w")} w:offsetFrom="page"><w:top w:val="double" w:sz="12" w:space="24" w:color="000000"/><w:left w:val="double" w:sz="12" w:space="24" w:color="000000"/><w:bottom w:val="double" w:sz="12" w:space="24" w:color="000000"/><w:right w:val="double" w:sz="12" w:space="24" w:color="000000"/></w:pgBorders>'
pgBorders = parse_xml(xml_str)
sect._sectPr.append(pgBorders)

p = doc.add_paragraph('Test with double page border')
doc.save(r'C:\Users\VEERAJ\OneDrive\Desktop\NoSQL\test_border.docx')

word = win32com.client.Dispatch('Word.Application')
d = word.Documents.Open(r'C:\Users\VEERAJ\OneDrive\Desktop\NoSQL\test_border.docx')
d.SaveAs(r'C:\Users\VEERAJ\OneDrive\Desktop\NoSQL\test_border.pdf', FileFormat=17)
d.Close()
word.Quit()
print('Page border test passed!')
