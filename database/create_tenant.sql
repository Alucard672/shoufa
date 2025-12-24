-- 创建测试租户的SQL语句
-- 可以直接在MySQL数据库中执行

USE `shoufa_db`;

-- 插入一个测试租户
INSERT INTO `tenants` (`name`, `contact`, `phone`, `address`, `create_time`, `update_time`, `deleted`) 
VALUES 
('测试租户', '管理员', '13800138000', '测试地址', NOW(), NOW(), 0);

-- 查询验证
SELECT * FROM `tenants` WHERE `deleted` = 0;

