# Open Expense Splitter

A full-stack application for tracking and splitting spending across groups. Built with React + Vite on the frontend and Node.js + Hono on the backend, with SQLite for persistent data storage and Auth0 for user authentication. Supports deployment to Cloudflare Workers and D1 databases.

<img width="5088" height="3648" alt="image" src="https://github.com/user-attachments/assets/6395598f-fe26-4674-979f-283aeb211fb7" />

## Features

- 🔐 **User Authentication** - Secure login via Auth0
- 💾 **Persistent Data** - SQLite database with automatic persistence
- 📊 **Spending Tracking** - Track individual and batch spending
- 🔒 **Data Privacy** - Users can only view their own data
- 📱 **Responsive UI** - Modern React interface with daisyUI components
- 🚀 **Hot Reload** - Development with instant reload
- ☁️ **Serverless Ready** - Deploy to Cloudflare Workers + Pages

## Security Notice

- Cloudflare-hosted deployments (the current public version) use encryption in transit (TLS) and encryption at rest for D1-managed data. See the Cloudflare documentation: https://developers.cloudflare.com/d1/reference/data-security/
- Self-hosted deployments do not encrypt data at rest by default.
- This project has not undergone an external third-party security audit. Do not use it for sensitive financial data.

## Live Demo

**Try it now:** [open-expense-splitter.loicba.me](https://open-expense-splitter.loicba.me)

Sign up with Auth0 and start tracking shared expenses right away. No credit card required. Ever.

## Quick Start

```bash
git clone https://github.com/loic294/open-expense-splitter.git
cd open-expense-splitter
cp .env.example .env
npm run dev
```

See **[Quick Start Wiki](https://github.com/loic294/open-expense-splitter/wiki/Quick-Start)** for detailed instructions.

## Deploy to Cloudflare

See [Set up Auth0](https://github.com/loic294/open-expense-splitter/wiki/Installation) for required environment variables.

| Service      | Deploy                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/loic294/open-expense-splitter/tree/main/server) |
| **Frontend** | [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/loic294/open-expense-splitter/tree/main/client) |

## Documentation

| Topic                     | Link                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Installation**          | [Set up Auth0](https://github.com/loic294/open-expense-splitter/wiki/Installation)                    |
| **Quick Start**           | [Get running in minutes](https://github.com/loic294/open-expense-splitter/wiki/Quick-Start)           |
| **Local Development**     | [Develop without Docker](https://github.com/loic294/open-expense-splitter/wiki/Local-Development)     |
| **Docker Deployment**     | [Deploy with Docker](https://github.com/loic294/open-expense-splitter/wiki/Docker-Deployment)         |
| **Cloudflare Deployment** | [Deploy to Cloudflare](https://github.com/loic294/open-expense-splitter/wiki/Cloudflare-Deployment)   |
| **Environment Variables** | [All env vars reference](https://github.com/loic294/open-expense-splitter/wiki/Environment-Variables) |
| **API Reference**         | [All endpoints](https://github.com/loic294/open-expense-splitter/wiki/API-Reference)                  |
| **Database Schema**       | [Data structure](https://github.com/loic294/open-expense-splitter/wiki/Database-Schema)               |
| **Architecture**          | [Tech stack & design](https://github.com/loic294/open-expense-splitter/wiki/Architecture)             |
| **Troubleshooting**       | [Common issues](https://github.com/loic294/open-expense-splitter/wiki/Troubleshooting)                |

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Auth0
- **Backend**: Node.js, Hono, TypeScript, SQLite
- **Deployment**: Docker, Cloudflare Workers, Cloudflare Pages
- **Database**: SQLite (Docker) or D1 (Cloudflare)
- **Authentication**: Auth0

## License

[CC BY-NC 4.0](LICENSE) — Free for personal use. Commercial use requires explicit written permission from the author.
