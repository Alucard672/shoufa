-- MySQL数据库表结构
-- 数据库名称: shoufa_db
-- 字符集: utf8mb4
-- 排序规则: utf8mb4_unicode_ci

CREATE DATABASE IF NOT EXISTS `shoufa_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `shoufa_db`;

-- 1. 租户表 (tenants)
CREATE TABLE IF NOT EXISTS `tenants` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL COMMENT '租户名称',
  `contact` VARCHAR(50) COMMENT '联系人',
  `phone` VARCHAR(20) COMMENT '联系电话',
  `address` VARCHAR(200) COMMENT '地址',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '软删除标记',
  INDEX `idx_deleted` (`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='租户表';

-- 2. 用户表 (users)
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT UNSIGNED NOT NULL COMMENT '租户ID',
  `openid` VARCHAR(100) NOT NULL COMMENT '微信OpenID',
  `name` VARCHAR(50) COMMENT '用户姓名',
  `phone` VARCHAR(20) COMMENT '手机号',
  `role` VARCHAR(20) NOT NULL DEFAULT 'user' COMMENT '角色',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '软删除标记',
  UNIQUE KEY `uk_openid` (`openid`),
  INDEX `idx_tenant_id` (`tenant_id`),
  INDEX `idx_deleted` (`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 3. 款号表 (styles)
CREATE TABLE IF NOT EXISTS `styles` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT UNSIGNED NOT NULL COMMENT '租户ID',
  `style_code` VARCHAR(50) NOT NULL COMMENT '款号编号',
  `style_name` VARCHAR(100) NOT NULL COMMENT '款号名称',
  `image_url` VARCHAR(500) COMMENT '款式图片URL',
  `category` VARCHAR(50) COMMENT '类别',
  `yarn_usage_per_piece` DECIMAL(10,2) NOT NULL COMMENT '单件纱线用量（克）',
  `loss_rate` DECIMAL(5,2) DEFAULT 0 COMMENT '损耗率（%）',
  `actual_usage` DECIMAL(10,2) COMMENT '实际用量（含损耗，kg）',
  `available_colors` JSON COMMENT '可选颜色列表',
  `available_sizes` JSON COMMENT '可选尺码列表',
  `yarn_ids` JSON COMMENT '关联的纱线ID列表',
  `remark` TEXT COMMENT '备注',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '软删除标记',
  UNIQUE KEY `uk_tenant_style_code` (`tenant_id`, `style_code`),
  INDEX `idx_tenant_deleted` (`tenant_id`, `deleted`),
  INDEX `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='款号表';

-- 4. 加工厂表 (factories)
CREATE TABLE IF NOT EXISTS `factories` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT UNSIGNED NOT NULL COMMENT '租户ID',
  `name` VARCHAR(100) NOT NULL COMMENT '加工厂名称',
  `contact` VARCHAR(50) COMMENT '联系人',
  `phone` VARCHAR(20) COMMENT '联系方式',
  `default_price` DECIMAL(10,2) NOT NULL COMMENT '默认加工单价（元/打）',
  `settlement_method` VARCHAR(20) NOT NULL DEFAULT '月结' COMMENT '结算方式',
  `remark` TEXT COMMENT '备注',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '软删除标记',
  INDEX `idx_tenant_deleted` (`tenant_id`, `deleted`),
  INDEX `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='加工厂表';

-- 5. 纱线库存表 (yarn_inventory)
CREATE TABLE IF NOT EXISTS `yarn_inventory` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT UNSIGNED NOT NULL COMMENT '租户ID',
  `yarn_name` VARCHAR(100) NOT NULL COMMENT '纱线名称/批次',
  `color` VARCHAR(50) COMMENT '颜色',
  `current_stock` DECIMAL(10,2) NOT NULL COMMENT '当前库存数量（kg）',
  `remark` TEXT COMMENT '备注',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '软删除标记',
  INDEX `idx_tenant_deleted` (`tenant_id`, `deleted`),
  INDEX `idx_yarn_name` (`yarn_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='纱线库存表';

-- 6. 生产计划单表 (production_plans)
CREATE TABLE IF NOT EXISTS `production_plans` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT UNSIGNED NOT NULL COMMENT '租户ID',
  `plan_no` VARCHAR(50) NOT NULL COMMENT '计划单号',
  `style_id` INT UNSIGNED NOT NULL COMMENT '款号ID',
  `color` VARCHAR(50) NOT NULL COMMENT '颜色',
  `size` VARCHAR(20) NOT NULL COMMENT '尺码',
  `plan_quantity` INT UNSIGNED NOT NULL COMMENT '计划数量（件）',
  `factory_id` INT UNSIGNED NOT NULL COMMENT '计划加工厂ID',
  `plan_date` DATE NOT NULL COMMENT '计划日期',
  `plan_yarn_usage` DECIMAL(10,2) NOT NULL COMMENT '计划用纱量（kg）',
  `status` VARCHAR(20) NOT NULL DEFAULT '待发料' COMMENT '状态',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '软删除标记',
  UNIQUE KEY `uk_tenant_plan_no` (`tenant_id`, `plan_no`),
  INDEX `idx_style_id` (`style_id`),
  INDEX `idx_factory_id` (`factory_id`),
  INDEX `idx_tenant_deleted` (`tenant_id`, `deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='生产计划单表';

-- 7. 发料单表 (issue_orders)
CREATE TABLE IF NOT EXISTS `issue_orders` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT UNSIGNED NOT NULL COMMENT '租户ID',
  `issue_no` VARCHAR(50) NOT NULL COMMENT '发料单号',
  `factory_id` INT UNSIGNED NOT NULL COMMENT '加工厂ID',
  `style_id` INT UNSIGNED NOT NULL COMMENT '款号ID',
  `color` VARCHAR(50) NOT NULL COMMENT '颜色',
  `size` VARCHAR(20) COMMENT '尺码',
  `issue_weight` DECIMAL(10,2) NOT NULL COMMENT '发料重量（kg）',
  `issue_date` DATE NOT NULL COMMENT '发料日期',
  `plan_id` INT UNSIGNED COMMENT '关联生产计划单ID',
  `status` VARCHAR(20) NOT NULL DEFAULT '未回货' COMMENT '状态',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '软删除标记',
  UNIQUE KEY `uk_tenant_issue_no` (`tenant_id`, `issue_no`),
  INDEX `idx_factory_id` (`factory_id`),
  INDEX `idx_style_id` (`style_id`),
  INDEX `idx_issue_date` (`issue_date`),
  INDEX `idx_tenant_deleted_date` (`tenant_id`, `deleted`, `issue_date`),
  INDEX `idx_factory_deleted_date` (`factory_id`, `deleted`, `issue_date`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='发料单表';

-- 8. 回货单表 (return_orders)
CREATE TABLE IF NOT EXISTS `return_orders` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT UNSIGNED NOT NULL COMMENT '租户ID',
  `return_no` VARCHAR(50) NOT NULL COMMENT '回货单号',
  `factory_id` INT UNSIGNED NOT NULL COMMENT '加工厂ID',
  `issue_id` INT UNSIGNED NOT NULL COMMENT '发料单ID',
  `style_id` INT UNSIGNED NOT NULL COMMENT '款号ID',
  `return_quantity` DECIMAL(10,2) NOT NULL COMMENT '回货数量（打）',
  `return_pieces` INT UNSIGNED NOT NULL COMMENT '回货件数',
  `actual_yarn_usage` DECIMAL(10,2) NOT NULL COMMENT '实际用纱量（kg）',
  `return_date` DATE NOT NULL COMMENT '回货日期',
  `processing_fee` DECIMAL(10,2) NOT NULL COMMENT '加工费',
  `settled_amount` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '已结算金额',
  `settlement_status` VARCHAR(20) NOT NULL DEFAULT '未结算' COMMENT '结算状态',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '软删除标记',
  UNIQUE KEY `uk_tenant_return_no` (`tenant_id`, `return_no`),
  INDEX `idx_factory_id` (`factory_id`),
  INDEX `idx_issue_id` (`issue_id`),
  INDEX `idx_return_date` (`return_date`),
  INDEX `idx_tenant_deleted_date` (`tenant_id`, `deleted`, `return_date`),
  INDEX `idx_factory_deleted_date` (`factory_id`, `deleted`, `return_date`),
  INDEX `idx_issue_deleted` (`issue_id`, `deleted`),
  INDEX `idx_settlement_status` (`settlement_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='回货单表';

-- 9. 结算表 (settlements)
CREATE TABLE IF NOT EXISTS `settlements` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT UNSIGNED NOT NULL COMMENT '租户ID',
  `settlement_no` VARCHAR(50) NOT NULL COMMENT '结算单号',
  `factory_id` INT UNSIGNED NOT NULL COMMENT '加工厂ID',
  `settlement_date` DATE NOT NULL COMMENT '结算日期',
  `total_amount` DECIMAL(10,2) NOT NULL COMMENT '结算总金额',
  `return_order_ids` JSON COMMENT '关联的回货单ID列表',
  `remark` TEXT COMMENT '备注',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '软删除标记',
  UNIQUE KEY `uk_tenant_settlement_no` (`tenant_id`, `settlement_no`),
  INDEX `idx_factory_id` (`factory_id`),
  INDEX `idx_settlement_date` (`settlement_date`),
  INDEX `idx_tenant_deleted` (`tenant_id`, `deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='结算表';

-- 10. 颜色字典表 (color_dict)
CREATE TABLE IF NOT EXISTS `color_dict` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT UNSIGNED NOT NULL COMMENT '租户ID',
  `name` VARCHAR(50) NOT NULL COMMENT '颜色名称',
  `code` VARCHAR(20) COMMENT '颜色编码',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_tenant_name` (`tenant_id`, `name`),
  INDEX `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='颜色字典表';

-- 11. 尺码字典表 (size_dict)
CREATE TABLE IF NOT EXISTS `size_dict` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT UNSIGNED NOT NULL COMMENT '租户ID',
  `name` VARCHAR(20) NOT NULL COMMENT '尺码名称',
  `code` VARCHAR(20) COMMENT '尺码编码',
  `order` INT UNSIGNED DEFAULT 0 COMMENT '排序序号',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_tenant_name` (`tenant_id`, `name`),
  INDEX `idx_order_time` (`order`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='尺码字典表';

