import win32com.client
from generate_9page_report import create_full_report

create_full_report()
word = win32com.client.Dispatch('Word.Application')
doc = word.Documents.Open(r'C:\Users\VEERAJ\OneDrive\Desktop\NoSQL\MongoTrace_Project_Report.docx')
pages = doc.ComputeStatistics(2)
print('Current pages:', pages)
doc.Close()
word.Quit()
