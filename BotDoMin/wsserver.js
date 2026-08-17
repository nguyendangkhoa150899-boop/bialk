// ===== WEBSOCKET TỰ VIẾT, KHÔNG THƯ VIỆN =====
// Gắn vào http server sẵn có (cùng cổng 3002). Chỉ cần crypto của Node -> KHÔNG phải
// npm install gì trên VPS. Dùng để ĐẨY trạng thái bàn blackjack xuống mọi người xem
// theo thời gian thực (đồng hồ đếm ngược, tới lượt ai, lá bài mới) thay vì poll.
//
// Chỉ làm đúng thứ cần: nhận text frame từ client, gửi text frame xuống, trả lời ping,
// đóng gọn gàng. Không nén, không phân mảnh (payload nhỏ, vài KB).

const crypto = require('crypto');
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// Mã hoá 1 text frame server->client (không mask theo chuẩn).
function encodeFrame(str) {
    const payload = Buffer.from(str, 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
        header = Buffer.from([0x81, len]);
    } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81; header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6);
    }
    return Buffer.concat([header, payload]);
}

// Bộ giải mã frame client->server. Trả các sự kiện qua callback vì 1 gói TCP có thể
// chứa nhiều frame, hoặc 1 frame trải trên nhiều gói -> phải gom buffer.
function makeParser(onText, onClose, onPing) {
    let buf = Buffer.alloc(0);
    return (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 2) {
            const fin = buf[0] & 0x80;               // (không xử lý phân mảnh — coi mỗi frame là trọn)
            const opcode = buf[0] & 0x0f;
            const masked = buf[1] & 0x80;
            let len = buf[1] & 0x7f;
            let off = 2;
            if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
            else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
            const need = off + (masked ? 4 : 0) + len;
            if (buf.length < need) return;            // chưa đủ 1 frame, chờ thêm
            let payload;
            if (masked) {
                const mask = buf.slice(off, off + 4);
                payload = Buffer.alloc(len);
                for (let i = 0; i < len; i++) payload[i] = buf[off + 4 + i] ^ mask[i & 3];
            } else {
                payload = buf.slice(off, off + len);
            }
            buf = buf.slice(need);
            if (opcode === 0x8) { onClose(); return; }        // close
            else if (opcode === 0x9) onPing(payload);          // ping -> cần trả pong
            else if (opcode === 0x1) onText(payload.toString('utf8')); // text
            // opcode khác (binary/pong) bỏ qua
        }
    };
}

// clients: Set các {socket, alive, ...meta}. Cho phép gắn dữ liệu (userId) sau khi xác thực.
function attachWebSocket(httpServer, { path = '/ws', onConnect, onMessage, onClose } = {}) {
    const clients = new Set();

    httpServer.on('upgrade', (req, socket) => {
        if (new URL(req.url, 'http://x').pathname !== path) { socket.destroy(); return; }
        const key = req.headers['sec-websocket-key'];
        if (!key) { socket.destroy(); return; }
        const accept = crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
            'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
        );

        const client = {
            socket,
            meta: {},
            send(obj) { try { socket.write(encodeFrame(typeof obj === 'string' ? obj : JSON.stringify(obj))); } catch { } },
            close() { try { socket.write(Buffer.from([0x88, 0])); socket.end(); } catch { } },
        };
        clients.add(client);

        const parser = makeParser(
            (text) => { try { onMessage && onMessage(client, JSON.parse(text)); } catch { } },
            () => cleanup(),
            (pl) => { try { socket.write(Buffer.concat([Buffer.from([0x8a, pl.length]), pl])); } catch { } } // pong
        );
        function cleanup() {
            if (!clients.has(client)) return;
            clients.delete(client);
            onClose && onClose(client);
            try { socket.destroy(); } catch { }
        }
        socket.on('data', (d) => { try { parser(d); } catch { cleanup(); } });
        socket.on('close', cleanup);
        socket.on('error', cleanup);

        onConnect && onConnect(client, req);
    });

    return {
        clients,
        broadcast(obj) { const s = typeof obj === 'string' ? obj : JSON.stringify(obj); const f = encodeFrame(s); for (const c of clients) { try { c.socket.write(f); } catch { } } },
        // gửi cho những client thoả điều kiện (vd theo userId)
        sendWhere(pred, objFor) { for (const c of clients) if (pred(c)) c.send(objFor(c)); },
        count() { return clients.size; },
    };
}

module.exports = { attachWebSocket, encodeFrame, makeParser };
