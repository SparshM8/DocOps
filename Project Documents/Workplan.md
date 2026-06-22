The Agile Build (Implementation Plan)
To execute this within the Hackathon Phase 2 sprint, the workload must be running in parallel.

Sprint 1: Foundation & Ingestion
Frontend Task: Scaffold the Next.js application, set up Tailwind, and build the static mobile chat view and desktop upload dashboard.

Backend Task: Set up the Node.js/Express server, configure MongoDB, and establish the API endpoints for document uploading.

AI Task: Build the Python/FastAPI ingestion script. Take a sample PDF, extract the text, chunk it into logical segments, generate embeddings, and store them in the Vector DB.

Checkpoint: A PDF can be uploaded via the UI, processed by Python, and stored in the databases.

Sprint 2: The RAG Pipeline & Integration 
Frontend Task: Connect the Next.js chat interface to the Express query endpoint. Implement loading states and render the citation links.

Backend Task: Build the query routing. When Next.js sends a question, Express routes it to the FastAPI search endpoint.

AI Task: Build the Retrieval-Augmented Generation logic. Take the user query, search the Vector DB for the nearest chunks, pass the context to the LLM, and format the response to include the page_number and filename.

Checkpoint: A user can type a question in the UI and receive an accurate, cited answer derived from the uploaded PDF.

Sprint 3: Polish & Hackathon Deliverables
Team Task: Conduct rigorous testing against the "Evaluation Focus" benchmark (entity extraction accuracy and cross-functional knowledge discovery).

Deliverable Prep: Record the seamless demo video showing the mobile view in action, finalize the architecture diagram, and polish the presentation deck to highlight the 35% time-saving business impact.