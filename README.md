# 🚀 Notion React Starter
### Getting Started

- 1️⃣ `git clone https://github.com/neurosity/notion-react-starter.git`
- 2️⃣ `cd notion-react-starter`
- 3️⃣ `npm install`
- 4️⃣ `npm start`

### The Stack

- ⚛️ Built with React - [Create React App](https://github.com/facebook/create-react-app)
- 🏆 React Router - [react-router-dom](https://reactrouter.com)
- 🤯 NotionJS API - [@neurosity/notion](https://github.com/neurosity/notion-js)
- 🔑 NotionJS Authentication
- 👍 React Use - [react-use](https://github.com/streamich/react-use)

MIT License

### Terminal commands
- To create virtual environment
```bash
python3 -m venv venv
```

- To start virtual environment
```bash
source .venv/bin/activate
```

- To install dependencies
```bash
pip install -r requirements.txt
```

- To set up GUI
```bash
npm start
```

- To start API
```bash
python -m uvicorn backend.app:app --reload
```

- To run analysis on a participant (swap out P001 for participant's ID)
```bash
python ml/train_rf.py --db-path ./backend/edubci.sqlite --participant-id P001
```