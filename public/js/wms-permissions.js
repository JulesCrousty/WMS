import { hasPermission } from "./permissions.js";

export const WMS_PERMISSIONS = {
  ACCESS: "WMS_ACCESS",
  MANAGE_SITES: "WMS_SITE_MANAGE",
  MANAGE_WAREHOUSE: "WMS_WAREHOUSE_MANAGE",
  ITEM_VIEW: "WMS_ITEM_VIEW",
  ITEM_MANAGE: "WMS_ITEM_MANAGE",
  STOCK_VIEW: "WMS_STOCK_VIEW",
  STOCK_ADJUST: "WMS_STOCK_ADJUST",
  INBOUND_MANAGE: "WMS_INBOUND_MANAGE",
  INBOUND_RECEIVE: "WMS_INBOUND_RECEIVE",
  TRANSFER: "WMS_TRANSFER_MANAGE",
  INVENTORY_MANAGE: "WMS_INVENTORY_MANAGE",
  INVENTORY_COUNT: "WMS_INVENTORY_COUNT"
};

export function userCan(user, permission) {
  return hasPermission(user, permission);
}

export function canViewSiteDeck(user) {
  return userCan(user, WMS_PERMISSIONS.MANAGE_SITES) || userCan(user, WMS_PERMISSIONS.STOCK_VIEW);
}

export function canOperateInbound(user) {
  return userCan(user, WMS_PERMISSIONS.INBOUND_MANAGE) || userCan(user, WMS_PERMISSIONS.INBOUND_RECEIVE);
}

export function canOperateInventory(user) {
  return userCan(user, WMS_PERMISSIONS.INVENTORY_MANAGE) || userCan(user, WMS_PERMISSIONS.INVENTORY_COUNT);
}

export function filterSectionsForUser(sections, user) {
  return sections.filter((section) => {
    if (!section.permissions || section.permissions.length === 0) {
      return true;
    }
    return section.permissions.some((permission) => userCan(user, permission));
  });
}
