-- Sử dụng master để kiểm tra và xóa database nếu tồn tại
USE master;
IF EXISTS (SELECT * FROM SYS.DATABASES WHERE NAME = 'DictionaryDB')
BEGIN
    ALTER DATABASE DictionaryDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE DictionaryDB;
END
GO

-- Tạo Database DictionaryDB
CREATE DATABASE DictionaryDB;
GO

-- Sử dụng Database
USE DictionaryDB;
GO

-- Tạo bảng từ vựng
CREATE TABLE Words (
    word_id INT IDENTITY(1,1) PRIMARY KEY,
    word NVARCHAR(100) UNIQUE NOT NULL,
    language NVARCHAR(10) DEFAULT 'en', -- Ngôn ngữ của từ
    created_at DATETIME DEFAULT GETDATE()
);

CREATE INDEX idx_word ON Words (word);

-- Tạo bảng phiên âm
CREATE TABLE Phonetic (
    phonetic_id INT IDENTITY(1,1) PRIMARY KEY,
    word_id INT NOT NULL,
    phonetic NVARCHAR(100) NOT NULL, -- Phiên âm của từ
    FOREIGN KEY (word_id) REFERENCES Words(word_id) ON DELETE CASCADE
);
ALTER TABLE Phonetic ADD CONSTRAINT unique_phonetic UNIQUE (word_id, phonetic);

-- Tạo bảng lưu nghĩa của từ
CREATE TABLE Meanings (
    meaning_id INT IDENTITY(1,1) PRIMARY KEY,
    word_id INT NOT NULL,
    definition NVARCHAR(1000) NOT NULL,
    FOREIGN KEY (word_id) REFERENCES Words(word_id) ON DELETE CASCADE
);
ALTER TABLE Meanings ADD CONSTRAINT unique_meaning UNIQUE (word_id, definition);

-- Tạo bảng lưu loại từ (Đổi tên cột "type" thành "word_type" để tránh lỗi)
CREATE TABLE WordTypes (
    type_id INT IDENTITY(1,1) PRIMARY KEY,
    word_id INT NOT NULL,
    word_type NVARCHAR(50) NOT NULL,
    FOREIGN KEY (word_id) REFERENCES Words(word_id) ON DELETE CASCADE
);
ALTER TABLE WordTypes ADD CONSTRAINT unique_word_type UNIQUE (word_id, word_type);

-- Tạo bảng ví dụ sử dụng từ
CREATE TABLE Examples (
    example_id INT IDENTITY(1,1) PRIMARY KEY,
    word_id INT NOT NULL,
    example NVARCHAR(1000) NOT NULL,
    FOREIGN KEY (word_id) REFERENCES Words(word_id) ON DELETE CASCADE
);
ALTER TABLE Examples ADD CONSTRAINT unique_example UNIQUE (word_id, example);

-- Tạo bảng lịch sử tìm kiếm
CREATE TABLE SearchHistory (
    search_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    word NVARCHAR(100) NOT NULL,
    search_time DATETIME DEFAULT GETDATE()
);

-- Tạo bảng người dùng
CREATE TABLE Users (
    user_id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(50) UNIQUE NOT NULL,
    password_hash NVARCHAR(255) NOT NULL,
    role NVARCHAR(20) CHECK (role IN ('admin', 'user')) DEFAULT 'user',
    created_at DATETIME DEFAULT GETDATE()
);

-- Tạo tài khoản admin mặc định với mật khẩu được mã hóa SHA2_256
INSERT INTO Users (username, password_hash, role) 
VALUES ('admin', CONVERT(NVARCHAR(255), HASHBYTES('SHA2_256', 'admin123')), 'admin');

-- Cấp quyền truy cập cho user
CREATE USER dictionary_user FOR LOGIN dictionary_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON Words TO dictionary_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON Phonetic TO dictionary_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON Meanings TO dictionary_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON WordTypes TO dictionary_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON Examples TO dictionary_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON SearchHistory TO dictionary_user;

-- Cho phép truy cập từ xa
EXEC sp_configure 'show advanced options', 1;
RECONFIGURE;
EXEC sp_configure 'remote access', 1;
RECONFIGURE;

-- Chèn dữ liệu mẫu vào bảng Words
INSERT INTO Words (word) VALUES
('apple'), ('run'), ('beautiful'), 
('computer'), ('book'),
('play'), ('smart'), ('house'),
('eat'), ('happy');

-- Chèn dữ liệu mẫu vào bảng Phonetic
INSERT INTO Phonetic (word_id, phonetic) VALUES 
(1, '/ˈæp.l̩/'),(2, '/rʌn/'),(3, '/ˈbjuː.tɪ.fəl/'),(4, '/kəmˈpjuː.tər/'),
(5, '/bʊk/'),(6, '/pleɪ/'),(7, '/smɑːrt/'), (8, '/haʊs/'),(9, '/iːt/'),(10, '/ˈhæp.i/');

-- Chèn dữ liệu mẫu vào bảng WordTypes
INSERT INTO WordTypes (word_id, word_type) VALUES
(1, 'noun'), (2, 'verb'), (3, 'adjective'), (4, 'noun'), (5, 'noun'),
(6, 'verb'), (7, 'adjective'), (8, 'noun'), (9, 'verb'), (10, 'adjective');

-- Chèn dữ liệu mẫu vào bảng Meanings
INSERT INTO Meanings (word_id, definition) VALUES
(1, 'A round fruit with red or green skin.'),
(2, 'To move quickly on foot.'),
(3, 'Pleasing the senses or mind aesthetically.'),
(4, 'An electronic device for storing and processing data.'),
(5, 'A set of written, printed, or blank pages fastened together.'),
(6, 'Engage in an activity for enjoyment.'),
(7, 'Having or showing intelligence.'),
(8, 'A building for human habitation.'),
(9, 'Put food into the mouth and chew.'),
(10, 'Feeling or showing pleasure.');

-- Chèn dữ liệu mẫu vào bảng Examples
INSERT INTO Examples (word_id, example) VALUES
(1, 'She ate an apple for breakfast.'),
(2, 'He runs every morning.'),
(3, 'The sky is so beautiful today.'),
(4, 'I bought a new computer.'),
(5, 'She borrowed a book from the library.'),
(6, 'The kids love to play in the park.'),
(7, 'He is a very smart student.'),
(8, 'They built a new house last year.'),
(9, 'We eat dinner at 7 PM.'),
(10, 'She was happy to see her friend.');

-- Truy vấn tìm kiếm từ điển với phiên âm
DECLARE @searchWord NVARCHAR(100) = 'apple';  -- Thay 'apple' bằng từ cần tìm

SELECT 
    W.word AS 'Từ',
    (SELECT STRING_AGG(P.phonetic, ', ') FROM Phonetic P WHERE P.word_id = W.word_id) AS 'Phiên âm',
    (SELECT STRING_AGG(WT.word_type, ', ') FROM WordTypes WT WHERE WT.word_id = W.word_id) AS 'Loại từ',
    (SELECT STRING_AGG(M.definition, '; ') FROM Meanings M WHERE M.word_id = W.word_id) AS 'Nghĩa',
    (SELECT STRING_AGG(E.example, ' | ') FROM Examples E WHERE E.word_id = W.word_id) AS 'Ví dụ'
FROM Words W
WHERE W.word = @searchWord;


