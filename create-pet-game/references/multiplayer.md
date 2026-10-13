# 把玩法接入联机

玩法由用户决定，技术起点不限制游戏类型。可以把示例的 `game.js` 整体替换，只保留桥的调用边界；也可直接按 SDK 契约写自己的适配层。

发送方为房主：持有规则状态、时间和随机种子，验证双方输入，计算碰撞、得分和胜负。客人发送自己的意图，只显示房主确认的结果。两边按本机输入立即给视觉反馈，逻辑判定以房主为准。

把纯规则、绘制、输入与联机装配分开；小项目可以用同样清晰的函数划分。打包时都并入 game.js。不要让第二个客户端拥有另一套独立规则。

| 类型 | 适合传什么 | 需要测什么 |
| --- | --- | --- |
| 棋盘/回合 | 带 round、turn、actionId 的落点，确认后的完整棋盘 | 非本回合拒绝、重复动作只执行一次、双方胜负一致 |
| 实时射击/赛车 | 最新轴向/按住状态、瞄准、累积动作计数；房主快照 | 输入不丢边沿、移动平滑、裁判判定、断线暂停 |
| 合作闯关 | 各自输入与共同场景状态 | 不能一端通关另一端未通关；重连恢复同一局 |
| 隐藏信息 | 各玩家可见视图，必要时分开投递 | 客人数据中不含其不该知道的位置/手牌 |

## 用本包桥接

```js
const link = PetGameBridge.create({
  protocol: {id:'my-pet-game',version:1},
  onMessage: message => handleGameMessage(message),
  onStatus: status => { /* 刷新连接状态；断线禁用推进 */ },
  onResync: () => { /* 房主重新发布完整状态 */ },
  onError: error => { /* 显示错误，不假装连接成功 */ }
});
const context = await link.connect();
// context.mode === 'preview'：本地预览，没有真正的对手。
link.latest('input','game.input',{round,sequence,keys,fireCount});
await link.reliable('game.ready',{round});
```

完整 API 见 `assets/starter/pet-bridge.js`。`latest` 只表示进入本地合并队列；重要操作要有确认/重发或累计计数。回调中异常会报告，不会卡住 poll。

起点示例每 350ms 重发累积 count/ready；房主快照中的 seen/ready 是业务确认，新 round 会清空旧输入。它适用于这个小计分示例；独立回合动作更适合上面的 reliable + actionId + 确认/重试设计。

建议一个状态 key、一个输入 key。不要把人物像素/完整角色资源每帧传输。`readCharacter()` 读取本人当前 idle 图；`sharePortrait()` 在连接后一次缩略、发送。收到 `onPortrait(dataUrl)` 可作为对方头像。这不是完整 3D 模型同步。

## 生命周期

双方准备 → 房主创建新 round/seed → 处理输入 → 裁定结果 → 双方都选择再来一局。重开递增 round，丢弃旧局迟到消息，重置输入计数。按钮禁用必须与真实连接/准备状态对应。

断线时停止逻辑推进、清理按住键并显示恢复状态。重连后先恢复完整状态再接受新操作；处理旧 epoch 的消息。房主离开/会话关闭要明确告知对方，不能永久等待。

绘制频率与联网频率分开。实时画面使用 requestAnimationFrame，必要时插值；不要把收消息当作唯一绘制时钟。高实时性游戏必须实测输入反馈和网络状态年龄，不能仅因能连通就声称流畅。
