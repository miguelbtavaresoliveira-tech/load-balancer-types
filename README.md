# Load Balancer Types

A TypeScript-based repository demonstrating the implementation, behavior, and performance characteristics of various HTTP load-balancing algorithms.

---

## 🚀 Getting Started

### Prerequisites & Installation

Ensure you have [Node.js](https://nodejs.org/) installed, then install the dependencies:

```bash
npm install
```

### Running the Services

To observe the load balancing behavior, open three separate terminal sessions:

```bash
# Terminal 1: Start backend servers with distinct latencies: server-1 (50ms), server-2 (200ms), server-3 (600ms)
npm run backends

# Terminal 2: Start the TypeScript Load Balancer on port 8080
# Available algorithms: round-robin | weighted | least-connections | least-response-time | sticky
npm run balancer -- round-robin

# Terminal 3: Run the load testing tool
npm run loadtest -- http://localhost:8080 30 1 1 
```

---

## 📊 Supported Load Balancing Algorithms

| Algorithm | Observed Traffic Distribution | Mechanism & Description |
| :--- | :--- | :--- |
| **Round Robin** | `33%` / `33%` / `33%` | Rotates incoming requests sequentially across all available backend servers (`1 -> 2 -> 3 -> 1...`). |
| **Weighted** *(weights 5, 3, 1)* | `56%` / `33%` / `11%` | Implements NGINX's smooth weighted round-robin algorithm to interleave requests (`1 -> 2 -> 1 -> 3 -> 1 -> 2 -> 1 -> 2 -> 1`) rather than bursting 5 consecutive requests to a single server. |
| **Least Connections** *(concurrency 10)* | `68%` / `22%` / `10%` | Dynamically routes traffic to the server currently processing the fewest active connections. |
| **Least Response Time** *(concurrency 10)* | `70%` / `13%` / `17%` | Evaluates a moving average of response times alongside active connections to select the fastest available server. |
| **Sticky Sessions** *(3 clients)* | Equal client distribution | The initial request selects a backend via Round Robin and persists the selection using an `LB_BACKEND` cookie for all subsequent requests from that client. |

---

## 🧮 Algorithm Details

### Least Response Time Calculation
The load balancer maintains a moving average of response times ($\text{RT}_{\text{avg}}$) for each server and computes a selection score:

$$\text{Score} = \text{RT}_{\text{avg}} \times (\text{Active Connections} + 1)$$

The server with the lowest score is selected to serve the request.

---

## 🛠 Features & Diagnostics

* **Live Stats & Metrics:** Access `http://localhost:8080/__lb/stats` in your browser to inspect current active connection counts and moving average response times for each backend server.
* **Fault Tolerance & Health Recovery:** If a backend server crashes or drops offline, the load balancer temporarily removes it from rotation for 5 seconds before re-evaluating its availability.
* **Simulating High Latency:** Append `?delay=3000` to any URL (e.g., `http://localhost:8080/?delay=3000`) to force a 3-second delay, allowing you to observe how dynamic algorithms like `least-connections` respond to sudden latency spikes.