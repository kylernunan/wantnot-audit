/* Generated from skus.json — do not hand-edit. Run tools/sync_catalog.py
   Dual shape: array [label,var] for audit.html and object {label,v} for dashboard.html. */
function _k(label, v){ const a=[label,v]; a.label=label; a.v=v; return a; }
var KINDS = {
  unassigned_seats:_k('Unassigned seats','--k1'),
  disabled_user:_k('Disabled accounts','--k2'),
  deleted_user:_k('Deleted accounts','--k3'),
  dormant_user:_k('Dormant users','--k4'),
  never_signed_in:_k('Never signed in','--k5'),
  redundant_sku:_k('Redundant licenses','--k6'),
  downgrade_candidate:_k('Downgradable','--k7'),
};
var KINDS_SHARED = KINDS;
var ORDER_SHARED = Object.keys(KINDS);
if (typeof module !== 'undefined') module.exports = { KINDS, KINDS_SHARED, ORDER_SHARED };
