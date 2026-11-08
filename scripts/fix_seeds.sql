DELETE FROM users;
DELETE FROM friends;
DELETE FROM wallets;

INSERT INTO users (id, email, password_hash, display_name, status_message, bio, created_at, updated_at) VALUES 
('00000000-0000-0000-0000-000000000001', 'admin@luno.local', 'LunoAdmin#2026!', 'System Administrator', '메신저 시스템 관리자 🛡️', 'System Administrator', datetime('now'), datetime('now')),
('00000000-0000-0000-0000-000000000002', 'user@luno.local', 'LunoUser#2026!', 'LUNO Demo User', '오늘도 행복한 하루 🍀', 'LUNO 공식 데모 계정입니다.', datetime('now'), datetime('now')),
('00000000-0000-0000-0000-000000000003', 'alice@luno-test.local', 'AliceStrongPass#2026', 'Alice Kim', '커피 한 잔의 여유 ☕', 'Developer & Designer', datetime('now'), datetime('now')),
('00000000-0000-0000-0000-000000000004', 'bob@luno-test.local', 'BobStrongPass#2026', 'Bob Lee', '열심히 코딩 중 💻', 'Software Engineer', datetime('now'), datetime('now'));

INSERT INTO friends (user_id, friend_id, status, created_at) VALUES
('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'accepted', datetime('now')),
('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'accepted', datetime('now')),
('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 'accepted', datetime('now')),
('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'accepted', datetime('now')),
('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', 'accepted', datetime('now')),
('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'accepted', datetime('now'));

INSERT INTO wallets (user_id, balance, updated_at) VALUES
('00000000-0000-0000-0000-000000000001', 500000, datetime('now')),
('00000000-0000-0000-0000-000000000002', 250000, datetime('now')),
('00000000-0000-0000-0000-000000000003', 180000, datetime('now')),
('00000000-0000-0000-0000-000000000004', 90000, datetime('now'));

