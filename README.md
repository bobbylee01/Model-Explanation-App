# Explain the Model

**App:** (https://bobbylee01.github.io/Model-Explanation-App/)

| Section | Direct link | My viewer should walk away knowing… |
|---|---|---|
| Push & Pull (linear regression) | https://bobbylee01.github.io/Model-Explanation-App/#linear | The viewers should understand how a starting prediction is adjusted by each feature's signed contribution |
| Wisdom of the Forest (random forest) | https://bobbylee01.github.io/Model-Explanation-App/#forest | The viewers should understand how 100 different decision trees combine their predictions through averaging |
| One Correction at a Time (gradient boosting) | https://bobbylee01.github.io/Model-Explanation-App/#boosting | The viewers should understand how sequential trees correct predictions and why validation error helps determine when to stop |

An app that explains three regression models to an anonymous visitor who knows about machine learning and regression, but not how these algorithms work. Datasets: NHANES fasting glucose, blood pressure and lung function.

Submit the link to **this repository** on Canvas. Reviewers open the app link above.

## What's here
| File | What it is |
|---|---|
| `AGENT_BRIEF.md` | Rules for your AI coding agent (have it read this first) |
| `SETUP.md` | How to run and publish (GitHub Pages or Streamlit) |
| `check.md` | Numbers your finished app must still show |
| `index.html`, `app.js`, `m10.js` | GitHub Pages route |
| `streamlit_app.py`, `m10.py`, `requirements.txt` | Streamlit route |
| `outputs/` | Reference model outputs (field guide: `outputs/SCHEMA.md`) |
| `data/` | The three datasets and the data dictionary |

## Run locally
- GitHub Pages route: `python -m http.server 8000`, then open <http://localhost:8000>
- Streamlit route: `uv run --with streamlit,pandas,numpy streamlit run streamlit_app.py`
