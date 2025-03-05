USE master
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

-- Tạo bảng lưu trữ từ vựng
CREATE TABLE Words (
    word_id INT IDENTITY(1,1) PRIMARY KEY,
    word NVARCHAR(100) UNIQUE NOT NULL,
    created_at DATETIME DEFAULT GETDATE()
);

-- Tạo bảng lưu nghĩa của từ
CREATE TABLE Meanings (
    meaning_id INT IDENTITY(1,1) PRIMARY KEY,
    word_id INT NOT NULL,
    definition NVARCHAR(MAX) NOT NULL,
    example NVARCHAR(MAX),
    FOREIGN KEY (word_id) REFERENCES Words(word_id) ON DELETE CASCADE
);

-- Tạo bảng lưu loại từ (danh từ, động từ, tính từ...)
CREATE TABLE WordTypes (
    type_id INT IDENTITY(1,1) PRIMARY KEY,
    word_id INT NOT NULL,
    type NVARCHAR(50) NOT NULL,
    FOREIGN KEY (word_id) REFERENCES Words(word_id) ON DELETE CASCADE
);

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

-- Tạo tài khoản admin mặc định
INSERT INTO Users (username, password_hash, role) 
VALUES ('admin', 'hashed_password_here', 'admin');

-- Cấp quyền truy cập cho user
CREATE USER dictionary_user FOR LOGIN dictionary_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON Words TO dictionary_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON Meanings TO dictionary_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON WordTypes TO dictionary_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON SearchHistory TO dictionary_user;

-- Cho phép truy cập từ xa
EXEC sp_configure 'show advanced options', 1;
RECONFIGURE;
EXEC sp_configure 'remote access', 1;
RECONFIGURE;
