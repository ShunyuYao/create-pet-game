/* MIT — create-pet-game contributors. Standalone HTML/work SDK adapter. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PetGameBridge = api;
})(globalThis, function (root) {
  'use strict';
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  const token = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value);
  function create(options = {}) {
    const sdk = options.sdk || root.pet;
    let context = null, mode = 'preview', status = 'idle', cursor = 0, epoch = 0;
    let disposed = false, started = false, connecting, timer, flushing = false, nextSend = 0;
    const queued = new Map();
    const snapshot = () => ({ mode, status, role: context?.role || 'host', peer: context?.peer || null, epoch });
    const report = error => { try { options.onError?.(error instanceof Error ? error : Error(String(error))); } catch {} };
    async function call(name, ...args) { try { return await options[name]?.(...args); } catch (error) { report(error); } }
    function setStatus(next) { if (status === next) return; status = next; void call('onStatus', snapshot()); }
    function assertMessage(type, payload, limit) {
      if (!token(type) || payload === undefined) throw Error('invalid_game_message');
      if (bytes({ type, payload }) > limit) throw Error('game_message_too_large');
    }
    function schedule() {
      clearTimeout(timer);
      if (disposed || !queued.size || status !== 'connected' || flushing) return;
      timer = setTimeout(flush, Math.max(0, nextSend - Date.now()));
    }
    async function flush() {
      if (disposed || status !== 'connected' || flushing) return;
      const entry = queued.entries().next().value; if (!entry) return;
      const [key, message] = entry; queued.delete(key); flushing = true;
      nextSend = Date.now() + Math.max(50, Math.ceil(bytes(message) / 131072 * 1000));
      try { await sdk.sessions.send(message); } catch (error) { report(error); }
      finally { flushing = false; schedule(); }
    }
    // Enqueue/coalesce an input or snapshot. This is not a delivery receipt.
    function latest(key, type, payload) {
      if (disposed) throw Error('session_closed');
      if (mode !== 'session') return false;
      if (!token(key) || (queued.size >= 6 && !queued.has(key))) throw Error('too_many_game_channels');
      assertMessage(type, payload, 48 * 1024);
      queued.set(key, { lane: 'latest', key, type, payload: JSON.parse(JSON.stringify(payload)) });
      schedule(); return true;
    }
    async function resync() {
      if (disposed || status !== 'connected') return;
      latest('bridge-sync', 'bridge.resync', { epoch });
      await call('onResync', snapshot());
    }
    async function event(e) {
      if (e.type === 'closed') { disposed = true; clearTimeout(timer); queued.clear(); setStatus('closed'); return; }
      if (e.type === 'resync_required') { await resync(); return; }
      if (e.type === 'transfer' && e.purpose === 'game.portrait.v1') {
        const asset = await sdk.sessions.readTransfer({ transferId: e.transferId });
        if (asset.purpose !== 'game.portrait.v1' || asset.contentType !== 'image/png' || asset.byteLength > 128 * 1024) throw Error('invalid_portrait');
        await call('onPortrait', 'data:image/png;base64,' + asset.dataBase64); return;
      }
      if (e.type === 'message') {
        if (e.message.type === 'bridge.resync') await call('onResync', snapshot());
        else await call('onMessage', e.message);
      } else await call('onEvent', e);
    }
    async function poll() {
      while (!disposed) {
        try {
          const batch = await sdk.sessions.poll({ cursor, waitMs: 1000 });
          if (disposed) break;
          const changed = epoch !== batch.epoch || status !== batch.transportState;
          epoch = batch.epoch; setStatus(batch.transportState); schedule();
          if (status === 'closed') { disposed = true; clearTimeout(timer); queued.clear(); break; }
          for (const item of batch.events) { if (disposed) break; try { await event(item); } catch (error) { report(error); } }
          cursor = batch.cursor; // advance even when one application callback fails
          if (changed && status === 'connected') await resync();
        } catch (error) {
          if (/session_closed|caller_disposed|permission_denied|permission_revoked|account_changed/.test(String(error.message))) {
            disposed = true; clearTimeout(timer); queued.clear(); setStatus('closed'); report(error); break;
          }
          setStatus('reconnecting'); report(error); await wait(350);
        }
        await wait(20);
      }
    }
    async function connect() {
      if (connecting) return connecting;
      if (started) return { ...snapshot(), context };
      if (disposed) throw Error('session_closed');
      connecting = (async () => {
        if (!sdk) {
          if (root.desktopGame) throw Error('host_sdk_unsupported');
          started = true; setStatus('preview'); return { ...snapshot(), context: null };
        }
        if (!sdk.sessions?.getContext || !sdk.sessions?.join || !sdk.sessions?.poll || !sdk.sessions?.send || !sdk.capabilities?.request) throw Error('host_sdk_unsupported');
        const grant = await sdk.capabilities.request({});
        if (disposed) throw Error('session_closed');
        if (grant.status !== 'granted') throw Error('permission_not_granted');
        context = await sdk.sessions.getContext();
        if (disposed) throw Error('session_closed');
        if (!context) { started = true; setStatus('preview'); return { ...snapshot(), context: null }; }
        if (options.protocol && (context.protocol.id !== options.protocol.id || context.protocol.version !== options.protocol.version)) throw Error('protocol_mismatch');
        mode = 'session';
        const result = await sdk.sessions.join();
        if (disposed) { await sdk.sessions.leave().catch(() => {}); throw Error('session_closed'); }
        epoch = result.epoch; started = true;
        setStatus(result.status === 'connected' ? 'connected' : 'waiting');
        void poll(); if (status === 'connected') await resync();
        return { ...snapshot(), context };
      })().catch(error => { if (!disposed) setStatus('error'); report(error); throw error; }).finally(() => { connecting = null; });
      return connecting;
    }
    // Use for bounded low-frequency control messages, not every frame.
    async function reliable(type, payload, messageId) {
      if (disposed || status !== 'connected') throw Error('peer_not_connected');
      assertMessage(type, payload, 7000);
      return sdk.sessions.send({ lane: 'reliable', type, payload, messageId: messageId || root.crypto.randomUUID() });
    }
    async function readCharacter() {
      if (!sdk?.character?.getCurrent) return null;
      return sdk.character.getCurrent({ states: ['idle'] });
    }
    async function sharePortrait(character) {
      if (status !== 'connected') return false;
      const current = character || await readCharacter();
      const image = new Image(); image.src = current?.poses?.[0]?.dataUrl || ''; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
      const scale = Math.min(96 / image.naturalWidth, 96 / image.naturalHeight);
      canvas.getContext('2d').drawImage(image, (96-image.naturalWidth*scale)/2, (96-image.naturalHeight*scale)/2, image.naturalWidth*scale, image.naturalHeight*scale);
      const dataBase64 = canvas.toDataURL('image/png').split(',')[1];
      if (dataBase64.length > 175000) throw Error('portrait_too_large');
      return sdk.sessions.transfer({ purpose: 'game.portrait.v1', contentType: 'image/png', dataBase64 });
    }
    function dispose() { disposed = true; clearTimeout(timer); queued.clear(); setStatus('closed'); }
    async function leave() { const wasSession = mode === 'session'; dispose(); return wasSession ? sdk.sessions.leave() : { released: true, peerAcknowledged: false }; }
    return { connect, latest, reliable, readCharacter, sharePortrait, leave, dispose, snapshot };
  }
  return Object.freeze({ create });
});
