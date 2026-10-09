# SME Receivables Financing Frontend

React 19、TypeScript、Vite、Mantine 和 Ethers.js 6 实现的 Sepolia DApp。

当前前端提供：

- MetaMask 连接、Sepolia 网络检查和钱包签名登录；
- Supplier、Buyer、Funder、Auditor、Arbitrator、Admin 多角色视图；
- 发票创建与确认、融资申请与报价、放款与还款；
- Overdue、Default、Holdback 结算；
- 争议冻结、证据哈希、三种裁决和争议还款托管；
- Auditor 状态汇总、资金流和链上事件时间线。

业务状态直接从五个智能合约读取，后端不维护业务状态或事件镜像。后端只负责钱包会话、发票编号元数据、实时 RPC 查询接口和交易验证记录。

## Run

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

开发环境中 Vite 将 `/api` 代理到 `http://127.0.0.1:5000`。启动前应确认 `.env` 中配置了当前部署的五个合约地址：

- `VITE_ROLE_REGISTRY_ADDRESS`
- `VITE_INVOICE_REGISTRY_ADDRESS`
- `VITE_FINANCING_MARKET_ADDRESS`
- `VITE_FINANCING_POOL_ADDRESS`
- `VITE_DISPUTE_RESOLUTION_ADDRESS`

## Verify

```powershell
npm run lint
npm run build
```

Audit 页面会在浏览器中实时扫描合约事件。演示前建议使用稳定的 Sepolia RPC 并预先打开一次 Audit 页面。
