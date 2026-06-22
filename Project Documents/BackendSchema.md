Backend Schema Design
MongoDB (Documents Collection):

doc_id (String)

filename (String)

upload_date (Timestamp)

extracted_tags (Array of Strings: e.g., ["Compressor", "Maintenance"])

status (String: "Parsed", "Processing", "Failed")

Vector Database (Payload):

vector (Float Array)

text_chunk (String)

doc_id (Reference to MongoDB)

page_number (Integer)