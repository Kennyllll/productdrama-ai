// 身份和预算规则里页面也要用的常量（不引 node:crypto，浏览器端可以用）
export type Role = "novice" | "admin";
export const ROLE_LABEL: Record<Role, string> = { novice: "新手", admin: "管理员" };
/** 提高到默认预算的几倍以上要再确认一次 */
export const BUDGET_BIG_RATIO = 1.5;
export const NEED_ADMIN = "需要管理员：请到「设置 → 身份」输入管理员 PIN";
