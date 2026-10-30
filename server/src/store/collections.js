import { MODS } from '../../../shared/modules.js';
/** All data collections (one MongoDB collection each) plus audits and settings */
export const DATA_COLS = Object.keys(MODS);              // assets, assignments, …, users, roles
export const INDEXES = {
  assets: [[{ assetTag: 1 }, { unique: true }], [{ serialNumber: 1 }], [{ ipAddress: 1 }], [{ categoryId: 1 }], [{ status: 1 }]],
  users: [[{ username: 1 }, { unique: true }]],
  employees: [[{ name: 1 }], [{ phone: 1 }]],
  tempAssignments: [[{ status: 1 }], [{ assetId: 1 }]],
  repairJobs: [[{ status: 1 }], [{ assetId: 1 }]],
  repairDispatches: [[{ status: 1 }], [{ repairJobId: 1 }]],
  networkLinks: [[{ ofcCableId: 1 }]],
  amcVisits: [[{ contractId: 1 }]],
};
