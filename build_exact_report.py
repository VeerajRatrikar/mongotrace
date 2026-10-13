import os
import sys
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls
import win32com.client

BLACK = RGBColor(0, 0, 0)
WHITE = RGBColor(255, 255, 255)
FONT_FAMILY = "Times New Roman"

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=60, bottom=60, left=80, right=80):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'<w:top w:w="{top}" w:type="dxa"/>'
        f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'<w:left w:w="{left}" w:type="dxa"/>'
        f'<w:right w:w="{right}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    tcPr.append(tcMar)

def set_table_borders(table, border_color="000000", border_sz="4"):
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'  <w:top w:val="single" w:sz="{border_sz}" w:space="0" w:color="{border_color}"/>'
        f'  <w:bottom w:val="single" w:sz="{border_sz}" w:space="0" w:color="{border_color}"/>'
        f'  <w:left w:val="single" w:sz="{border_sz}" w:space="0" w:color="{border_color}"/>'
        f'  <w:right w:val="single" w:sz="{border_sz}" w:space="0" w:color="{border_color}"/>'
        f'  <w:insideH w:val="single" w:sz="{border_sz}" w:space="0" w:color="{border_color}"/>'
        f'  <w:insideV w:val="single" w:sz="{border_sz}" w:space="0" w:color="{border_color}"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)

def add_heading_1(doc, text, space_before=10, space_after=4):
    h = doc.add_paragraph()
    h.paragraph_format.keep_with_next = True
    h.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    h.paragraph_format.space_before = Pt(space_before)
    h.paragraph_format.space_after = Pt(space_after)
    run = h.add_run(text)
    run.font.name = FONT_FAMILY
    run.font.size = Pt(16)
    run.bold = True
    run.font.color.rgb = BLACK
    return h

def add_heading_2(doc, text, space_before=8, space_after=3):
    h = doc.add_paragraph()
    h.paragraph_format.keep_with_next = True
    h.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    h.paragraph_format.space_before = Pt(space_before)
    h.paragraph_format.space_after = Pt(space_after)
    run = h.add_run(text)
    run.font.name = FONT_FAMILY
    run.font.size = Pt(14)
    run.bold = True
    run.font.color.rgb = BLACK
    return h

def add_heading_3(doc, text, space_before=6, space_after=2):
    h = doc.add_paragraph()
    h.paragraph_format.keep_with_next = True
    h.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    h.paragraph_format.space_before = Pt(space_before)
    h.paragraph_format.space_after = Pt(space_after)
    run = h.add_run(text)
    run.font.name = FONT_FAMILY
    run.font.size = Pt(12)
    run.bold = True
    run.font.color.rgb = BLACK
    return h

def add_p(doc, text, space_after=4, line_spacing=1.12):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = line_spacing
    r = p.add_run(text)
    r.font.name = FONT_FAMILY
    r.font.size = Pt(11)
    r.font.color.rgb = BLACK
    return p

def add_bold_body(doc, bold_prefix, text, space_after=4, line_spacing=1.12):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = line_spacing
    
    rb = p.add_run(bold_prefix)
    rb.font.name = FONT_FAMILY
    rb.font.size = Pt(11)
    rb.bold = True
    rb.font.color.rgb = BLACK
    
    rt = p.add_run(text)
    rt.font.name = FONT_FAMILY
    rt.font.size = Pt(11)
    rt.font.color.rgb = BLACK
    return p

def add_bold_subhead(doc, text, space_before=6, space_after=2):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(text)
    r.font.name = FONT_FAMILY
    r.font.size = Pt(11)
    r.bold = True
    r.font.color.rgb = BLACK
    return p

def add_bullet(doc, text, bold_prefix=None, space_after=3):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.left_indent = Inches(0.28)
    p.paragraph_format.first_line_indent = -Inches(0.20)
    p.paragraph_format.space_before = Pt(0.5)
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = 1.10
    
    rb = p.add_run("• ")
    rb.font.name = FONT_FAMILY
    rb.font.size = Pt(11)
    rb.font.color.rgb = BLACK
    
    if bold_prefix:
        r_pre = p.add_run(bold_prefix)
        r_pre.bold = True
        r_pre.font.name = FONT_FAMILY
        r_pre.font.size = Pt(11)
        r_pre.font.color.rgb = BLACK
        
    rt = p.add_run(text)
    rt.font.name = FONT_FAMILY
    rt.font.size = Pt(11)
    rt.font.color.rgb = BLACK
    return p

def format_styled_table(table, col_widths, headers, data, header_bg="1B365D", alt_bg="F8F9FA"):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(table, border_color="D3D3D3", border_sz="4")
    
    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        set_cell_background(hdr_cells[i], header_bg)
        set_cell_margins(hdr_cells[i], top=50, bottom=50, left=70, right=70)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        for run in p.runs:
            run.font.bold = True
            run.font.name = FONT_FAMILY
            run.font.size = Pt(10)
            run.font.color.rgb = WHITE
            
    for row_idx, row_data in enumerate(data):
        row_cells = table.add_row().cells
        bg_hex = alt_bg if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, val in enumerate(row_data):
            row_cells[col_idx].text = str(val)
            set_cell_background(row_cells[col_idx], bg_hex)
            set_cell_margins(row_cells[col_idx], top=40, bottom=40, left=70, right=70)
            p = row_cells[col_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for run in p.runs:
                run.font.size = Pt(9.5)
                run.font.name = FONT_FAMILY
                run.font.color.rgb = BLACK
                if col_idx == 0:
                    run.font.bold = True
                    
    for row in table.rows:
        for idx, width in enumerate(col_widths):
            row.cells[idx].width = Inches(width)

def build_report():
    doc = Document()
    
    # Standard margins: 0.8 inches
    for s in doc.sections:
        s.top_margin = Inches(0.8)
        s.bottom_margin = Inches(0.8)
        s.left_margin = Inches(0.8)
        s.right_margin = Inches(0.8)
        
        # Configure double-line page border
        sectPr = s._sectPr
        xml_border = (
            f'<w:pgBorders {nsdecls("w")} w:offsetFrom="page">'
            f'<w:top w:val="double" w:sz="12" w:space="24" w:color="000000"/>'
            f'<w:left w:val="double" w:sz="12" w:space="24" w:color="000000"/>'
            f'<w:bottom w:val="double" w:sz="12" w:space="24" w:color="000000"/>'
            f'<w:right w:val="double" w:sz="12" w:space="24" w:color="000000"/>'
            f'</w:pgBorders>'
        )
        sectPr.append(parse_xml(xml_border))
        
        # Configure start page number = 2
        pgNumType = parse_xml(f'<w:pgNumType {nsdecls("w")} w:start="2"/>')
        sectPr.append(pgNumType)
        
        # Configure footer: "PAGE | P a g e"
        footer = s.footer
        f_p = footer.paragraphs[0]
        f_p.text = ""
        f_p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        f_run1 = f_p.add_run()
        fld = parse_xml(f'<w:fldSimple {nsdecls("w")} w:instr="PAGE"/>')
        f_run1._r.append(fld)
        f_run1.font.name = FONT_FAMILY
        f_run1.font.size = Pt(10)
        f_run1.font.color.rgb = BLACK
        
        f_run2 = f_p.add_run(" | P a g e")
        f_run2.font.name = FONT_FAMILY
        f_run2.font.size = Pt(10)
        f_run2.font.color.rgb = BLACK

    # =========================================================================
    # PAGE 1 (Numbered 2 | P a g e): TABLE OF CONTENTS
    # =========================================================================
    toc_p = doc.add_paragraph()
    toc_p.paragraph_format.space_before = Pt(24)
    toc_p.paragraph_format.space_after = Pt(12)
    
    # Table of Contents table
    toc_table = doc.add_table(rows=1, cols=3)
    toc_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(toc_table, border_color="CCCCCC", border_sz="4")
    
    toc_headers = ["Sl No.", "Contents", "Page"]
    toc_widths = [1.0, 4.7, 1.1]
    
    hdr_cells = toc_table.rows[0].cells
    for i, title in enumerate(toc_headers):
        hdr_cells[i].text = title
        set_cell_background(hdr_cells[i], "FFFFFF")
        set_cell_margins(hdr_cells[i], top=80, bottom=80, left=90, right=90)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT if i < 2 else WD_ALIGN_PARAGRAPH.RIGHT
        r = p.runs[0]
        r.font.bold = True
        r.font.name = FONT_FAMILY
        r.font.size = Pt(11)
        r.font.color.rgb = BLACK

    toc_rows = [
        ("1", "Title of the Project", "03"),
        ("2", "Abstract", "03"),
        ("3", "Introduction and Background", "04"),
        ("4", "Problem Statement", "05"),
        ("5", "Objectives of the Project", "06"),
        ("6", "Proposed Methodology", "07-08"),
        ("7", "Technologies / Tools to be Used", "09-10"),
        ("8", "Expected Outcomes and Applications", "11-12"),
        ("9", "Conclusion", "13"),
        ("10", "References", "14"),
        ("", "", ""),
        ("", "", ""),
        ("", "", "")
    ]
    
    for r_idx, (sl, content, pg) in enumerate(toc_rows):
        row_cells = toc_table.add_row().cells
        bg_hex = "F8F9FA" if r_idx % 2 == 1 else "FFFFFF"
        for c_idx, val in enumerate([sl, content, pg]):
            row_cells[c_idx].text = val
            set_cell_background(row_cells[c_idx], bg_hex)
            set_cell_margins(row_cells[c_idx], top=70, bottom=70, left=90, right=90)
            p = row_cells[c_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT if c_idx < 2 else WD_ALIGN_PARAGRAPH.RIGHT
            for run in p.runs:
                run.font.name = FONT_FAMILY
                run.font.size = Pt(11)
                run.font.color.rgb = BLACK
                if c_idx == 0 and val:
                    run.font.bold = True
                    
    for row in toc_table.rows:
        for idx, width in enumerate(toc_widths):
            row.cells[idx].width = Inches(width)

    # PAGE BREAK -> PAGE 2
    doc.add_page_break()

    # =========================================================================
    # PAGE 2 (Numbered 3 | P a g e): 1. Title of the Project & 2. Abstract
    # =========================================================================
    add_heading_1(doc, "1. Title of the Project", space_before=12, space_after=6)
    
    title_run_p = doc.add_paragraph()
    title_run_p.paragraph_format.space_before = Pt(2)
    title_run_p.paragraph_format.space_after = Pt(18)
    t_run = title_run_p.add_run("MongoTrace : Self-Evolving Digital Evidence Intelligence Platform")
    t_run.font.name = FONT_FAMILY
    t_run.font.size = Pt(14)
    t_run.bold = True
    t_run.font.color.rgb = BLACK

    add_heading_1(doc, "2. Abstract", space_before=6, space_after=8)
    
    add_p(
        doc,
        "The MongoTrace platform is a comprehensive digital forensics and incident response intelligence system designed to bridge the operational gap between raw, distributed security telemetry and deterministic multi-stage cyber incident reconstruction. In enterprise environments, digital evidence originates from disparate, polymorphic sources—such as operating system process execution telemetry, system authentication events, network packet metadata, cloud identity logs, and memory injection alerts. MongoTrace ingests these disparate streams into a unified NoSQL schema, establishes cryptographic tamper-evidence using SHA-256 canonical hashing, and reconstructs how complex security incidents evolved over time.",
        space_after=8
    )
    
    add_p(
        doc,
        "The platform operates in two distinct forensic modes. In Live Telemetry Ingestion Mode, it continuously ingests high-throughput event streams, validates document structure, computes cryptographic verification digests, and evaluates incoming records against automated correlation rules. In Forensic Case Investigation Mode, it isolates incident boundaries, reconstructs multi-hop attack graphs using recursive graph lookups, identifies missing forensic evidence intervals, flags conflicting observations (such as impossible travel velocity or cryptographic hash divergence), and produces an immutable, legally defensible chain-of-custody audit trail.",
        space_after=8
    )
    
    add_p(
        doc,
        "The system is built on a high-performance backend powered by Node.js and Express, operating over native MongoDB Community Server v8.3.11 deployed directly on Windows 11 without containerization overhead. The persistence layer leverages MongoDB's flexible BSON document model, native aggregation pipelines, compound indexing, and the $graphLookup operator to perform recursive relationship discovery across event hierarchies. Binary evidence artifacts and disk images are archived reliably using MongoDB GridFS chunked storage. The presentation tier features an interactive, minimalist white forensic dashboard with timeline scrubbers, node-link attack graphs, and real-time Server-Sent Events (SSE) telemetry, providing forensic investigators with immediate, actionable incident intelligence.",
        space_after=8
    )

    # PAGE BREAK -> PAGE 3
    doc.add_page_break()

    # =========================================================================
    # PAGE 3 (Numbered 4 | P a g e): 3. Introduction and Background
    # =========================================================================
    add_heading_1(doc, "3. Introduction and Background", space_before=12, space_after=6)
    
    add_heading_2(doc, "3.1 Introduction", space_before=6, space_after=6)
    add_p(
        doc,
        "In modern cybersecurity operations, digital forensics and incident response (DFIR) teams are tasked with investigating increasingly sophisticated, distributed attack campaigns. Advanced persistent threats (APTs), ransomware operators, and insider adversaries frequently employ Living-off-the-Land (LotL) binaries, memory-only execution, and credential theft to camouflage malicious activities within legitimate administrative workflows. As a result, forensic investigators are inundated with massive volumes of heterogeneous log data generated across enterprise endpoints, network appliances, and cloud infrastructure.",
        space_after=8
    )
    add_p(
        doc,
        "MongoTrace addresses this challenge directly. Rather than treating security logs as passive, flat text files or disconnected database rows, MongoTrace transforms forensic telemetry into self-evolving, versioned, and graph-connected evidence documents. By pairing native NoSQL persistence with real-time temporal alignment, cryptographic tamper-proofing, and automated anomaly detection, the platform provides security examiners with a clear, verifiable answer to the critical forensic question: 'How did this incident unfold, which entities were compromised, and what evidence corroborates each stage of the attack?'",
        space_after=12
    )

    add_heading_2(doc, "3.2 Background", space_before=6, space_after=6)
    add_p(
        doc,
        "The discipline of digital evidence management is governed by strict legal and technical standards, including NIST Special Publication 800-61 (Computer Security Incident Handling Guide) and ISO/IEC 27037 (Guidelines for Identification, Collection, Acquisition, and Preservation of Digital Evidence). These standards mandate that all collected digital artifacts maintain strict chain of custody, deterministic provenance, and complete immutability from initial acquisition through courtroom presentation.",
        space_after=8
    )
    add_p(
        doc,
        "Traditional Security Information and Event Management (SIEM) solutions and relational database management systems (RDBMS) encounter fundamental architectural bottlenecks when applied to modern digital forensics. Relational databases enforce rigid tabular schemas that cannot natively accommodate the polymorphic, deeply nested structure of security telemetry—such as Windows XML Event Data, Linux auditd structures, and Suricata network JSON payloads. Altering relational schemas to capture new artifact types incurs substantial performance degradation and operational friction.",
        space_after=8
    )
    add_p(
        doc,
        "Recent advances in NoSQL document databases—specifically MongoDB—have enabled high-throughput ingestion of polymorphic BSON documents alongside native, multi-stage analytical aggregation pipelines. Document models allow semi-structured evidence artifacts to be stored naturally with arbitrary sub-documents and arrays. Furthermore, native MongoDB operators such as $graphLookup facilitate recursive, multi-hop relationship traversals across process execution trees and network communication flows directly in the database engine, eliminating expensive external graph compute layers.",
        space_after=8
    )

    # PAGE BREAK -> PAGE 4
    doc.add_page_break()

    # =========================================================================
    # PAGE 4 (Numbered 5 | P a g e): 4. Problem Statement
    # =========================================================================
    add_heading_1(doc, "4. Problem Statement", space_before=12, space_after=6)
    
    add_p(
        doc,
        "The following specific problems motivate the development of the MongoTrace platform:",
        space_after=8
    )
    
    add_bold_body(
        doc,
        "Fragmented Evidence and Log Silos: ",
        "Security telemetry is scattered across disjointed systems, including local endpoint event logs, firewall traffic archives, DNS servers, and authentication records. Without a unified persistence engine capable of ingesting and normalizing polymorphic structures, forensic examiners must manually correlate incompatible data formats across isolated consoles, resulting in fragmented situational awareness.",
        space_after=8
    )
    
    add_bold_body(
        doc,
        "Vulnerability to Tampering and Lack of Provenance: ",
        "In standard log aggregation systems, forensic records are vulnerable to accidental modification, unauthorized deletion, or intentional tampering by malicious insiders and root-level adversaries. Standard databases lack native cryptographic hashing per document, creating an unverifiable chain of custody that fails legal admissibility standards in judicial proceedings.",
        space_after=8
    )
    
    add_bold_body(
        doc,
        "Computational Bottlenecks in Multi-Hop Attack Path Reconstruction: ",
        "Reconstructing how an adversary traversed from an initial phishing payload to domain controller compromise requires multi-hop graph analysis. In relational databases, traversing recursive parent-child process hierarchies and network sessions requires complex recursive CTEs or repeated table self-joins that degrade exponentially as log volumes grow into millions of records.",
        space_after=8
    )
    
    add_bold_body(
        doc,
        "Delayed Incident Response and Cognitive Overload: ",
        "Security analysts face hundreds of unprioritized alerts daily. Without automated detection of missing evidence intervals, timestamp anomalies (such as timestamp stomping), and conflicting witness observations, investigators expend critical hours manually sorting noise from genuine adversary actions.",
        space_after=8
    )
    
    add_bold_body(
        doc,
        "Schema Rigidity Failing Polymorphic Forensic Data: ",
        "Digital evidence encompasses radically different attribute sets: a network packet contains IP addresses, ports, and TCP flags; a process creation log contains command-line arguments, parent process IDs, and hashes; a registry entry contains hives and value types. Forcing this polymorphic data into fixed relational tables requires dozens of nullable columns or excessive schema migrations.",
        space_after=8
    )

    # PAGE BREAK -> PAGE 5
    doc.add_page_break()

    # =========================================================================
    # PAGE 5 (Numbered 6 | P a g e): 5. Objectives of the Project
    # =========================================================================
    add_heading_1(doc, "5. Objectives of the Project", space_before=12, space_after=6)
    
    add_heading_2(doc, "Primary Objectives:", space_before=6, space_after=6)
    
    add_bullet(
        doc,
        "To build an asynchronous, high-throughput evidence ingestion pipeline capable of parsing and normalizing polymorphic security telemetry—including Windows Security logs, Linux Syslog, network flows, and file hashes—into structured BSON documents."
    )
    add_bullet(
        doc,
        "To implement a cryptographic provenance engine that computes SHA-256 canonical document hashes upon ingestion, records cryptographically signed chain-of-custody ledgers, and detects any unauthorized tampering or document manipulation."
    )
    add_bullet(
        doc,
        "To develop a recursive graph analytics engine utilizing MongoDB's native $graphLookup operator to reconstruct multi-hop process trees, lateral movement pathways, and network communication graphs directly within the database tier."
    )
    add_bullet(
        doc,
        "To integrate an automated anomaly intelligence module that evaluates timeline consistency, flags missing observation intervals, isolates conflicting evidence, and computes composite incident confidence scores."
    )
    add_bullet(
        doc,
        "To create an interactive, minimalist web dashboard featuring real-time timeline scrubbing, node-link attack graphs, evidence filter cards, and case management interfaces."
    )
    add_bullet(
        doc,
        "To provide a verified forensic export module that generates tamper-evident audit packages and summary reports suitable for legal proceedings, corporate audits, and executive briefings."
    )
    
    add_heading_2(doc, "Secondary Objectives:", space_before=8, space_after=6)
    
    add_bullet(
        doc,
        "To support cross-case correlation, enabling investigators to identify shared indicators of compromise (IoCs), attacker infrastructure, and persistent threat actors across multiple independent investigations."
    )
    add_bullet(
        doc,
        "To implement automated MITRE ATT&CK mapping that tags ingested evidence items with standardized tactics and techniques (e.g., T1059 Command Execution, T1078 Valid Accounts)."
    )
    add_bullet(
        doc,
        "To leverage MongoDB GridFS for chunked, scalable storage and retrieval of raw binary evidence artifacts, memory dumps, and packet capture (PCAP) files."
    )
    add_bullet(
        doc,
        "To provide real-time event streaming via Server-Sent Events (SSE) to update active analyst dashboards without manual polling overhead."
    )

    # PAGE BREAK -> PAGE 6
    doc.add_page_break()

    # =========================================================================
    # PAGE 6 (Numbered 7 | P a g e): 6. Proposed Methodology (Stages 1 - 4)
    # =========================================================================
    add_heading_1(doc, "6. Proposed Methodology", space_before=12, space_after=6)
    
    add_p(
        doc,
        "The MongoTrace platform pipeline is organized into six sequential stages, progressing systematically from raw multi-source telemetry ingestion to verified forensic timeline and intelligence output.",
        space_after=8
    )
    
    add_heading_2(doc, "Stage 1 — Multi-Source Evidence Ingestion and Normalization", space_before=6, space_after=4)
    add_p(
        doc,
        "Forensic evidence is collected from heterogeneous endpoints and uploaded via RESTful API endpoints or batch ingestion streams. The Node.js ingestion controller extracts raw payload attributes—including timestamps, host identifiers, user accounts, process command lines, and network socket addresses. The data is normalized into a flexible BSON evidence schema containing standardized top-level routing fields alongside open-schema subdocuments for event-specific forensic attributes.",
        space_after=8
    )
    
    add_heading_2(doc, "Stage 2 — Cryptographic Provenance and Tamper-Proof Hashing", space_before=6, space_after=4)
    add_p(
        doc,
        "To guarantee evidentiary integrity, every normalized BSON document undergoes canonical JSON serialization. The backend cryptographic module computes a SHA-256 hash of the canonical representation and binds it to the document header alongside an acquisition timestamp and investigator metadata. Any subsequent modification to the document alters its hash, triggering immediate tamper-detection alerts during validation audits.",
        space_after=8
    )
    
    add_heading_2(doc, "Stage 3 — Temporal Alignment and Event Sequencing", space_before=6, space_after=4)
    add_p(
        doc,
        "In multi-system investigations, timestamps often suffer from clock skew and varying time zone offsets. Stage 3 converts all event timestamps to ISO-8601 UTC representation with millisecond precision. The sequencing engine assigns a deterministic sequence index within each case context and constructs an indexed timeline ledger to ensure chronological ordering across disparate event sources.",
        space_after=8
    )
    
    add_heading_2(doc, "Stage 4 — Forensic Correlation and Graph Analytics Engine", space_before=6, space_after=4)
    add_p(
        doc,
        "The correlation engine identifies causal and relational links between isolated evidence items. Using MongoDB's native $graphLookup aggregation operator, the platform traverses parent-child process execution trees (linking PPID to PID across command shells) and correlates user sessions with network connection events. Each discovered connection is recorded as a directed edge in the case graph, establishing the foundation for attack-path reconstruction.",
        space_after=8
    )

    # PAGE BREAK -> PAGE 7
    doc.add_page_break()

    # =========================================================================
    # PAGE 7 (Numbered 8 | P a g e): 6. Proposed Methodology (Continuation & Stages 5 - 6)
    # =========================================================================
    add_p(
        doc,
        "The overall evidential confidence score for a reconstructed case timeline is computed as:",
        space_after=6
    )
    
    formula_p = doc.add_paragraph()
    formula_p.paragraph_format.space_before = Pt(4)
    formula_p.paragraph_format.space_after = Pt(10)
    formula_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_form = formula_p.add_run(
        "Confidence Score = [ (Verified Artifacts × 1.0) + (Corroborated Evidence × 0.7) + (Unverified Events × 0.3) ]\n"
        "                   ÷ Total Evidence Nodes × 100"
    )
    r_form.font.name = FONT_FAMILY
    r_form.font.size = Pt(11)
    r_form.bold = True
    r_form.font.color.rgb = BLACK
    
    add_p(
        doc,
        "This produces an objective percentage score representing the mathematical reliability of the reconstructed attack narrative, displayed prominently in the forensic dashboard.",
        space_after=8
    )
    
    add_heading_2(doc, "Stage 5 — Anomaly Intelligence and Attack Path Reconstruction", space_before=6, space_after=4)
    add_p(
        doc,
        "The intelligence engine scans the unified case graph for forensic anomalies. It detects missing evidence links (such as a network listener spawning without corresponding inbound firewall telemetry), identifies timestamp manipulation (timestomping), flags impossible physical velocities in user authentication, and isolates lateral movement patterns. The system correlates discovered sequences against the MITRE ATT&CK knowledge base to classify attacker techniques and reconstruct the adversary's progression from initial access to objective execution.",
        space_after=8
    )
    
    add_heading_2(doc, "Stage 6 — Dashboard, Graph Visualization, and Chain of Custody Export", space_before=6, space_after=4)
    add_p(
        doc,
        "The presentation layer renders the reconstructed investigation across multiple forensic views. The Incident Overview dashboard displays summary metrics, confidence score gauges, and evidence distribution charts. The Interactive Timeline interface allows analysts to scrub through chronological events with zoom and filter controls. The Attack Graph visualization maps entities, processes, and network hops as an interactive node-link diagram. Finally, the Chain of Custody Export module packages the validated case data, hash ledgers, and forensic findings into standardized audit reports suitable for legal proceedings.",
        space_after=8
    )

    # PAGE BREAK -> PAGE 8
    doc.add_page_break()

    # =========================================================================
    # PAGE 8 (Numbered 9 | P a g e): 7. Technologies / Tools to be Used (Tables 7.1, 7.2, 7.3)
    # =========================================================================
    add_heading_1(doc, "7. Technologies / Tools to be Used", space_before=12, space_after=6)
    
    add_heading_2(doc, "7.1 Frontend", space_before=4, space_after=4)
    t1 = doc.add_table(rows=1, cols=3)
    t1_headers = ["Technology", "Version", "Purpose"]
    t1_widths = [1.8, 1.2, 3.8]
    t1_data = [
        ["HTML5 / Modern DOM", "W3C Standard", "Semantic layout for forensic dashboards and data tables"],
        ["Vanilla CSS (Custom)", "CSS3", "High-performance styling, dark/light themes, zero bloat"],
        ["Vanilla JavaScript", "ES2022", "Client-side state, event handling, timeline scrubbing logic"],
        ["SVG / Canvas Engine", "HTML5 Standard", "Interactive node-link attack graph and entity visualization"],
        ["Fetch API / SSE", "Living Standard", "Asynchronous REST requests and real-time live telemetry feeds"]
    ]
    format_styled_table(t1, t1_widths, t1_headers, t1_data)
    
    add_heading_2(doc, "7.2 Backend", space_before=6, space_after=4)
    t2 = doc.add_table(rows=1, cols=3)
    t2_headers = ["Technology", "Version", "Purpose"]
    t2_widths = [1.8, 1.2, 3.8]
    t2_data = [
        ["Node.js", "20.x LTS", "High-concurrency asynchronous runtime for I/O operations"],
        ["Express.js", "4.x", "Modular REST API routing, middleware, and request validation"],
        ["Node Crypto Module", "Native Core", "Cryptographic SHA-256 evidence hashing and verification"],
        ["Multer", "1.4.x", "Streaming multipart file uploads for raw binary evidence"],
        ["Server-Sent Events", "W3C Standard", "Unidirectional real-time event broadcasting to clients"]
    ]
    format_styled_table(t2, t2_widths, t2_headers, t2_data)
    
    add_heading_2(doc, "7.3 Database and Infrastructure", space_before=6, space_after=4)
    t3 = doc.add_table(rows=1, cols=2)
    t3_headers = ["Technology", "Purpose"]
    t3_widths = [2.2, 4.6]
    t3_data = [
        ["MongoDB Community Server v8.3.11", "Native Windows NoSQL persistence, aggregation pipelines, and indexing"],
        ["MongoDB Node.js Driver (v6.x)", "Native high-performance database connection pooling and cursor streaming"],
        ["MongoDB GridFS", "Chunked binary storage (255KB chunks) for forensic PCAPs and memory dumps"],
        ["MongoDB Compass", "Administrative GUI for physical schema inspection, index tuning, and query plans"],
        ["Windows Service Manager", "Native OS daemon hosting MongoDB service on port 27017 without Docker"]
    ]
    format_styled_table(t3, t3_widths, t3_headers, t3_data)

    # PAGE BREAK -> PAGE 9
    doc.add_page_break()

    # =========================================================================
    # PAGE 9 (Numbered 10 | P a g e): 7.4 NoSQL & Cryptographic Engine Components
    # =========================================================================
    add_heading_2(doc, "7.4 NoSQL & Cryptographic Engine Components", space_before=12, space_after=8)
    
    add_bullet(
        doc,
        "Leverages MongoDB's dynamic schema flexibility to store heterogeneous forensic telemetry (Windows Events, Syslog, firewall flows, and memory artifacts) within unified collections (evidence_items, cases, nodes, edges) without schema migration overhead.",
        bold_prefix="Polymorphic BSON Evidence Modeling: "
    )
    add_bullet(
        doc,
        "Utilizes MongoDB's native $graphLookup aggregation operator to perform recursive relationship discovery directly within the database engine, efficiently traversing parent-child process execution trees and network session hops without external graph engines.",
        bold_prefix="Recursive Graph Analytics via $graphLookup: "
    )
    add_bullet(
        doc,
        "Implements canonical JSON serialization and deterministic SHA-256 hashing on document ingestion. Generates tamper-evident hash ledgers that mathematically verify document integrity and establish courtroom-admissible evidence chains.",
        bold_prefix="Cryptographic Provenance with SHA-256 Chaining: "
    )
    add_bullet(
        doc,
        "Executes complex analytical queries utilizing $match, $project, $group, $sort, and $facet stages to compute real-time case metrics, confidence scores, and chronological timeline views in sub-50ms query times.",
        bold_prefix="Multi-Stage Aggregation Pipelines: "
    )
    add_bullet(
        doc,
        "Implements high-cardinality compound indexes on (caseId, timestamp), (caseId, evidenceType), and unique indexes on evidenceHash to ensure constant-time query latency across millions of evidence documents.",
        bold_prefix="Optimized Compound Indexing Strategy: "
    )
    add_bullet(
        doc,
        "Integrates MongoDB GridFS to automatically divide large forensic disk images and network PCAP files into standardized 255KB binary chunks, enabling scalable storage and streaming retrieval within the database ecosystem.",
        bold_prefix="Binary Artifact Virtualization with GridFS: "
    )

    # PAGE BREAK -> PAGE 10
    doc.add_page_break()

    # =========================================================================
    # PAGE 10 (Numbered 11 | P a g e): 8. Expected Outcomes and Applications (8.1 & 8.2 start)
    # =========================================================================
    add_heading_1(doc, "8. Expected Outcomes and Applications", space_before=12, space_after=6)
    
    add_heading_2(doc, "8.1 Expected Technical Outcomes", space_before=6, space_after=6)
    
    tech_outcomes = [
        "A fully functional full-stack digital evidence management platform running locally on native Windows 11 MongoDB Community Server with zero containerization overhead.",
        "An asynchronous ingestion pipeline capable of parsing and normalizing diverse security telemetry formats into structured BSON evidence documents within 200 ms per batch.",
        "A cryptographic provenance engine that guarantees zero undetected document modifications by computing and verifying SHA-256 canonical document hashes.",
        "A graph correlation pipeline using MongoDB $graphLookup that reconstructs multi-hop attack paths and process execution trees across thousands of evidence records in under 150 ms.",
        "An interactive, responsive web dashboard delivering real-time timeline scrubbing, node-link attack graphs, and forensic case cards rendered in under 1 second on initial load.",
        "An automated forensic export module producing tamper-evident audit packages and chain-of-custody ledgers suitable for judicial proceedings and regulatory compliance."
    ]
    for i, outcome in enumerate(tech_outcomes, 1):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(1)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.10
        r_num = p.add_run(f"{i}. ")
        r_num.bold = True
        r_num.font.name = FONT_FAMILY
        r_num.font.size = Pt(11)
        r_num.font.color.rgb = BLACK
        r_txt = p.add_run(outcome)
        r_txt.font.name = FONT_FAMILY
        r_txt.font.size = Pt(11)
        r_txt.font.color.rgb = BLACK

    add_heading_2(doc, "8.2 Applications", space_before=8, space_after=6)
    
    add_bold_subhead(doc, "Security Operations Centers (SOC):", space_before=4, space_after=2)
    add_bullet(
        doc,
        "Front-line security analysts can ingest high-volume alert streams into MongoTrace to immediately establish temporal context, filter false positives, and identify related events across endpoints."
    )
    add_bullet(
        doc,
        "SOC managers can track investigation velocity, monitor case progress, and audit analyst decisions through tamper-proof activity logs."
    )
    
    add_bold_subhead(doc, "Law Enforcement & Digital Forensics Laboratories:", space_before=6, space_after=2)
    add_bullet(
        doc,
        "Forensic examiners can maintain strict, mathematically verifiable chain-of-custody records for physical disk images and extracted artifacts presented as courtroom evidence."
    )
    add_bullet(
        doc,
        "Investigators can discover hidden connections between seemingly independent criminal cases through cross-case entity correlation."
    )

    # PAGE BREAK -> PAGE 11
    doc.add_page_break()

    # =========================================================================
    # PAGE 11 (Numbered 12 | P a g e): 8.2 Applications (Cont.) & 8.3 Performance Targets
    # =========================================================================
    add_bold_subhead(doc, "Enterprise Incident Response Teams (CSIRT):", space_before=4, space_after=2)
    add_bullet(
        doc,
        "Incident responders can rapidly reconstruct complex ransomware outbreaks and APT intrusions, pinpointing the exact initial access vector, lateral movement, and data exfiltration paths."
    )
    add_bullet(
        doc,
        "Post-incident reviews can leverage interactive graph timelines to formulate accurate remediation and eradication strategies."
    )
    
    add_bold_subhead(doc, "Regulatory Compliance & Internal Audit:", space_before=6, space_after=2)
    add_bullet(
        doc,
        "Compliance officers can demonstrate adherence to NIST SP 800-61, ISO/IEC 27037, and GDPR data breach reporting requirements with tamper-evident audit trails."
    )
    add_bullet(
        doc,
        "Internal audit departments can independently verify log integrity and confirm that forensic findings have not been manipulated or suppressed."
    )
    
    add_heading_2(doc, "8.3 Performance Targets", space_before=8, space_after=6)
    
    t_perf = doc.add_table(rows=1, cols=2)
    t_perf_headers = ["Metric", "Target"]
    t_perf_widths = [3.8, 3.0]
    t_perf_data = [
        ["Evidence Ingestion Latency", "< 200 ms per batch (1,000 events)"],
        ["SHA-256 Cryptographic Hash Generation", "< 1 ms per evidence document"],
        ["Temporal Alignment Computation", "< 50 ms for 10,000 events"],
        ["$graphLookup Recursive Traversal (5 Hops)", "< 120 ms query response time"],
        ["Aggregation Pipeline Latency (Case Metrics)", "< 35 ms execution time"],
        ["Frontend Dashboard Initial Render", "< 1.0 second on cold start"],
        ["Database Query Response Time (p95)", "< 25 ms across indexed collections"],
        ["Tamper Detection Accuracy", "100% detection of modified BSON fields"]
    ]
    format_styled_table(t_perf, t_perf_widths, t_perf_headers, t_perf_data)

    # PAGE BREAK -> PAGE 12
    doc.add_page_break()

    # =========================================================================
    # PAGE 12 (Numbered 13 | P a g e): 9. Conclusion
    # =========================================================================
    add_heading_1(doc, "9. Conclusion", space_before=12, space_after=6)
    
    add_p(
        doc,
        "The MongoTrace platform addresses one of the most critical and challenging bottlenecks in modern cybersecurity operations: the inability of incident response teams to rapidly, accurately, and verifiably reconstruct complex cyber incidents from fragmented, multi-source security telemetry. By unifying high-throughput BSON document ingestion, cryptographic provenance via SHA-256 canonical hashing, temporal event alignment, and recursive graph analytics into a cohesive, native architecture, MongoTrace delivers a level of forensic intelligence and evidentiary rigor that conventional relational systems cannot provide.",
        space_after=8
    )
    
    add_p(
        doc,
        "The platform's most distinctive architectural advantage lies in its exploitation of native MongoDB capabilities. By leveraging polymorphic BSON document modeling, MongoTrace eliminates the rigid schema migration penalties that historically hindered forensic databases handling diverse telemetry formats. The application of MongoDB's native $graphLookup operator allows deep, multi-hop relationship traversals—such as parent-child process lineages and network lateral movement paths—to execute entirely within the database engine, avoiding the overhead and complexity of external graph synchronization.",
        space_after=8
    )
    
    add_p(
        doc,
        "From an evidentiary and legal perspective, MongoTrace establishes a new benchmark for digital provenance. By computing deterministic canonical hashes upon ingestion and maintaining an append-only audit ledger, the platform guarantees that every piece of evidence remains mathematically tamper-evident from initial acquisition through judicial presentation. Automated anomaly intelligence further assists investigators by pinpointing missing evidence intervals, timestamp stomping, and conflicting observations, transforming raw logs into actionable, courtroom-defensible truth.",
        space_after=8
    )
    
    add_p(
        doc,
        "The platform possesses substantial real-world applicability across enterprise Security Operations Centers, Computer Security Incident Response Teams (CSIRTs), law enforcement digital forensics laboratories, and regulatory compliance bodies. The modular architecture is designed to scale gracefully, supporting future extensions such as distributed cross-cluster evidence aggregation, automated MITRE ATT&CK mitigation recommendations, and machine-learning-driven threat actor attribution without requiring fundamental redesigns.",
        space_after=8
    )
    
    add_p(
        doc,
        "In summary, MongoTrace is not merely a centralized log repository or visualization utility. It is an end-to-end, self-evolving digital evidence intelligence platform built on the conviction that fast, accurate, and cryptographically verified incident reconstruction is essential to defending modern digital enterprise infrastructure.",
        space_after=8
    )

    # PAGE BREAK -> PAGE 13
    doc.add_page_break()

    # =========================================================================
    # PAGE 13 (Numbered 14 | P a g e): 10. References
    # =========================================================================
    add_heading_1(doc, "10. References", space_before=12, space_after=8)
    
    references = [
        ("1. ", "Casey, E. (2019). Digital Evidence and Computer Crime: Forensic Science, Computers, and the Internet (3rd ed.). Academic Press. [Comprehensive treatise on digital evidence preservation, chain of custody, and forensic admissibility standards.]"),
        ("2. ", "National Institute of Standards and Technology (NIST). (2022). Computer Security Incident Handling Guide (Special Publication 800-61 Revision 2). U.S. Department of Commerce. [Core framework for incident handling, evidence collection, and forensic documentation.]"),
        ("3. ", "International Organization for Standardization (ISO). (2020). ISO/IEC 27037: Information technology — Security techniques — Guidelines for identification, collection, acquisition and preservation of digital evidence. ISO/IEC. [International standard governing digital forensic integrity.]"),
        ("4. ", "MongoDB, Inc. (2024). MongoDB Manual — The Aggregation Pipeline and $graphLookup Operator. MongoDB Documentation. https://www.mongodb.com/docs/manual/core/aggregation-pipeline/ [Official documentation on document aggregation and recursive graph queries.]"),
        ("5. ", "MITRE Corporation. (2024). MITRE ATT&CK: Design and Principles. MITRE Corporation Technical Report. https://attack.mitre.org [Standardized framework for modeling cyber adversary tactics, techniques, and procedures.]"),
        ("6. ", "Choo, K. K. R., & Dehghantanha, A. (2020). Contemporary Digital Forensics: Investigations, Cloud, and IoT. Springer International Publishing. [Advanced research on cloud evidence extraction, polymorphic log parsing, and forensic correlation.]"),
        ("7. ", "Tilkov, S., & Vinoski, S. (2010). Node.js: Using JavaScript to Build High-Performance Network Programs. IEEE Internet Computing, 14(6), 80-83. [Foundational architectural principles of asynchronous, non-blocking I/O event loops.]"),
        ("8. ", "Stallings, W. (2021). Cryptography and Network Security: Principles and Practice (8th ed.). Pearson Education. [Theoretical and practical fundamentals of cryptographic hash functions and digital provenance verification.]")
    ]
    
    for prefix, ref_text in references:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.line_spacing = 1.12
        r_pre = p.add_run(prefix)
        r_pre.bold = True
        r_pre.font.name = FONT_FAMILY
        r_pre.font.size = Pt(11)
        r_pre.font.color.rgb = BLACK
        r_body = p.add_run(ref_text)
        r_body.font.name = FONT_FAMILY
        r_body.font.size = Pt(11)
        r_body.font.color.rgb = BLACK

    # Save document
    output_docx = r"C:\Users\VEERAJ\OneDrive\Desktop\NoSQL\MongoTrace_Project_Report.docx"
    doc.save(output_docx)
    print(f"[Success] Generated DOCX at: {output_docx}")

if __name__ == "__main__":
    build_report()
