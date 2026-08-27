 Smart GlycoVitals Logger 🩸🤖

A comprehensive, dual-mode AI-powered glucose monitoring and prediction dashboard built with React, Firebase, and TensorFlow (LSTM).


## ✨ Features
* **Real-time Glucose Tracking**: Log and monitor glucose, heart rate, and body temperature.
* **Dual-Mode AI Predictions**: 
  * **LSTM Model**: Deep learning predictions for the next 30 minutes when sufficient data is available.
  * **Fallback Algorithm**: Reliable linear-regression fallback engine for immediate predictions on new sessions.
* **Smart Alerts**: Context-aware alerts notifying patients of critical highs, lows, and predicting dangerous drops/spikes 30 minutes in advance.
* **Analytics**: Detailed visualizations including Time In Range (TIR), daily averages, model accuracy, and abnormal pattern detection.
* **Integrated AI Assistant**: Chat with an integrated medical assistant for context-based advice.

## 🏗 System Architecture

The project consists of two perfectly synced components:

1. **Frontend Dashboard (`/glycovitals-dashboard`)**
   * Built with React, Vite, TailwindCSS, and Recharts.
   * Real-time listener hooks connected to Firebase Realtime Database.
   
2. **Backend Machine Learning Engine (`/scripts/push_predictions.py`)**
   * Python-based TensorFlow/Keras LSTM inference engine.
   * Polls Firebase for new vital readings and seamlessly pushes AI predictions back to the cloud.

## 🚀 Quick Start (Local Development)

### Prerequisites
* Node.js & npm
* Python 3.9+
* Firebase Account

### 1. Configure Firebase Credentials
You will need your Firebase Admin SDK service account key.
1. Download your service account key from the Firebase Console.
2. Place it in the root directory and name it `serviceAccountKey.json`.
*(Make sure this file is never committed to GitHub, it is heavily `.gitignore`d!)*

### 2. Start the Frontend App
```bash
cd glycovitals-dashboard
npm install
npm run dev
```
The dashboard will start on `http://localhost:5173`.

### 3. Start the AI Prediction Engine
Open a new terminal at the project root and run:
```bash
pip install firebase-admin numpy tensorflow
python scripts/push_predictions.py --loop 300
```
This will start the engine in a continuous 5-minute loop matching your dashboard's realtime feed.

## 🔐 Security
* **Patient Data**: Protected by secure PIN authentication.
* **Credentials**: The Firebase structural definitions map solely via protected backend integrations.
