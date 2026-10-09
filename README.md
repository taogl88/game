# 霓虹竞技场 / Neon Arena

浏览器中的实时多人竞技游戏，最多 6 人同房。服务端统一处理移动、碰撞、射击、命中和计分。支持创建房间、邀请链接、单人 AI 练习和触屏操作。

## 本地启动

需要 Node.js 20 或更新版本，无第三方依赖：

```bash
npm ci
npm run check
npm start
```

打开 http://localhost:3000。两位玩家进入同一房间后，倒计时开始。每局 3 分钟，率先 20 杀获胜，时间结束则击杀数最多者获胜，平局共享胜利。阵亡 2 秒后重生。

桌面：WASD / 方向键移动，鼠标瞄准，按住左键 / 空格射击，Shift 冲刺。
触屏：方向按钮移动，自动瞄准最近的对手，按住开火，冲刺按钮躲避。

## Render 部署

仓库包含 render.yaml。使用下方入口在 Render 创建 Blueprint：

https://dashboard.render.com/blueprint/new?repo=https://github.com/taogl88/game

按提示连接 GitHub，选择此仓库并确认创建。构建执行 npm run check；通过后启动 npm start，并使用 /healthz 检查服务健康。Render 提供公网 HTTPS 地址，邀请朋友时使用这个地址。

使用免费套餐和单实例。免费实例闲置后可能休眠，首次打开可能需要等待。房间与积分保存在内存中，重启或发布后会清空。请保持单实例运行；多实例需要另行实现共享房间状态。端口使用 Render 注入的 PORT 环境变量，并监听 0.0.0.0。

## 检查范围

检查脚本覆盖战斗规则、碰撞、冲刺、重生、胜负结算，以及真实 Node HTTP 服务的创建/加入房间、SSE 状态同步、输入验证、容量限制、退出和练习模式。
