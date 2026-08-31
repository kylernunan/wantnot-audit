/* WantNot browser analyzer — port of shared/analyzer.py
   Loaded by dashboard/audit.html after catalog.js.
   Depends on global SKU_CATALOG (from catalog.js) for pricing.
   Kept behaviourally identical to the backend; verified by parity_check. */
// Fallback catalog for isolated evaluation (parity harness) — browser loads catalog.js first
if (typeof SKU_CATALOG === 'undefined') {
  var SKU_CATALOG = {
  AAD_PREMIUM:['Entra ID P1',6.00],
  AAD_PREMIUM_P2:['Entra ID P2',9.00],
  ATP_ENTERPRISE:['Defender for Office 365 P1',2.00],
  CCIBOTS_PRIVPREV_VIRAL:['Microsoft Copilot Studio Viral Trial',0.00],
  DESKLESSPACK:['Office 365 F3',4.00],
  EMS:['Enterprise Mobility + Security E3',10.60],
  EMSPREMIUM:['Enterprise Mobility + Security E5',16.40],
  ENTERPRISEPACK:['Office 365 E3',23.00],
  ENTERPRISEPREMIUM:['Office 365 E5',38.00],
  EXCHANGEDESKLESS:['Exchange Online Kiosk',2.00],
  EXCHANGEENTERPRISE:['Exchange Online Plan 2',8.00],
  EXCHANGESTANDARD:['Exchange Online Plan 1',4.00],
  FLOW_FREE:['Power Automate Free',0.00],
  IDENTITY_THREAT_PROTECTION:['Microsoft 365 E5 Security',12.00],
  INTUNE_A:['Intune Plan 1',8.00],
  M365_Copilot:['Microsoft 365 Copilot',30.00],
  M365_F1_COMM:['Microsoft 365 F1',3.00],
  MCOEV:['Teams Phone Standard',8.00],
  MCOMEETADV:['Teams Audio Conferencing',4.00],
  MCOPSTNC:['Communications Credits',0.00],
  MICROSOFT_365_E7:['Microsoft 365 E7',99.00],
  MS_TEAMS_IW:['Microsoft Teams Trial',0.00],
  "Microsoft_365_Business_Basic_(no Teams)":['Microsoft 365 Business Basic (no Teams)',5.40],
  Microsoft_365_Copilot:['Microsoft 365 Copilot',30.00],
  "Microsoft_365_E3_(no_Teams)":['Microsoft 365 E3 (no Teams)',30.45],
  "Microsoft_365_E5_(no_Teams)":['Microsoft 365 E5 (no Teams)',51.45],
  O365_BUSINESS:['Microsoft 365 Apps for business',10.00],
  O365_BUSINESS_ESSENTIALS:['Microsoft 365 Business Basic',7.00],
  O365_BUSINESS_PREMIUM:['Microsoft 365 Business Standard',12.50],
  OFFICESUBSCRIPTION:['Microsoft 365 Apps for enterprise',12.00],
  PBI_PREMIUM_PER_USER:['Power BI Premium Per User',24.00],
  POWERAPPS_PER_USER:['Power Apps Premium',20.00],
  POWERAPPS_VIRAL:['Power Apps Plan 2 Trial',0.00],
  POWERAUTOMATE_ATTENDED_RPA:['Power Automate Premium',15.00],
  POWER_BI_PRO:['Power BI Pro',14.00],
  POWER_BI_STANDARD:['Power BI (free)',0.00],
  PROJECTESSENTIALS:['Project Plan 1',10.00],
  PROJECTPREMIUM:['Project Plan 5',55.00],
  PROJECTPROFESSIONAL:['Project Plan 3',30.00],
  RIGHTSMANAGEMENT:['Azure Information Protection P1',2.00],
  SPB:['Microsoft 365 Business Premium',22.00],
  SPE_E3:['Microsoft 365 E3',39.00],
  SPE_E5:['Microsoft 365 E5',60.00],
  SPE_F1:['Microsoft 365 F3',10.00],
  STANDARDPACK:['Office 365 E1',10.00],
  STREAM:['Microsoft Stream',0.00],
  TEAMS_EXPLORATORY:['Teams Exploratory',0.00],
  TEAMS_FREE:['Microsoft Teams (free)',0.00],
  THREAT_INTELLIGENCE:['Defender for Office 365 P2',5.00],
  VISIOCLIENT:['Visio Plan 2',15.00],
  VISIOONLINE_PLAN1:['Visio Plan 1',5.00],
  WINDOWS_STORE:['Windows Store for Business',0.00],
  WIN_DEF_ATP:['Defender for Endpoint P2',5.20],
};
}
const skuName = p => (SKU_CATALOG[p] || [p])[0];
const skuPrice = p => (SKU_CATALOG[p] || [null,0])[1];
const isPriced = p => !!SKU_CATALOG[p] && SKU_CATALOG[p][1] > 0;

const DORMANT_DAYS_DEFAULT = 90;
const NEW_USER_GRACE_DAYS = 45;

const parseDt = v => { if(!v) return null; const d=new Date(v); return isNaN(d)?null:d; };

function lastActivity(user){
  const a = user.signInActivity || {};
  const c = [parseDt(a.lastSignInDateTime), parseDt(a.lastNonInteractiveSignInDateTime),
             parseDt(a.lastSuccessfulSignInDateTime)].filter(Boolean);
  return c.length ? new Date(Math.max(...c.map(d=>d.getTime()))) : null;
}

function fingerprintOf(kind, sku, upn){
  return kind === 'unassigned_seats' ? `${kind}|${sku}` : `${kind}|${sku}|${(upn||'').toLowerCase()}`;
}

function buildSkuIndex(subscribed){
  const idx = {};
  for(const s of subscribed){
    const plans = new Set((s.servicePlans||[])
      .filter(p => ['Success','PendingProvisioning','PendingInput'].includes(p.provisioningStatus))
      .map(p => p.servicePlanId));
    idx[s.skuId] = {
      skuId: s.skuId, skuPartNumber: s.skuPartNumber || 'UNKNOWN',
      enabled: (s.prepaidUnits||{}).enabled || 0,
      consumed: s.consumedUnits || 0, planIds: plans
    };
  }
  return idx;
}

function mkFinding(o){
  return { kind:o.kind, sku_part_number:o.sku, sku_display_name:skuName(o.sku),
    seats:o.seats, monthly_cost:+o.monthly.toFixed(2), annual_cost:+(o.monthly*12).toFixed(2),
    confidence:o.confidence, detail:o.detail,
    user_principal_name:o.upn||null, user_display_name:o.name||null,
    department:o.dept||'',
    evidence:o.evidence||{}, fingerprint:fingerprintOf(o.kind,o.sku,o.upn) };
}

function analyze(subscribed, users, signInAvailable, dormantDays){
  dormantDays = dormantDays || DORMANT_DAYS_DEFAULT;
  const idx = buildSkuIndex(subscribed);
  const now = Date.now();
  const dormantCut = now - dormantDays*864e5;
  const graceCut = now - NEW_USER_GRACE_DAYS*864e5;
  const findings = [];

  const spareByPart = {};
  for(const s of Object.values(idx)){
    if(!isPriced(s.skuPartNumber)) continue;
    const spare = s.enabled - s.consumed;
    if(spare <= 0) continue;
    const agg = spareByPart[s.skuPartNumber] || (spareByPart[s.skuPartNumber] =
      { seats:0, purchased:0, assigned:0 });
    agg.seats += spare; agg.purchased += s.enabled; agg.assigned += s.consumed;
  }
  for(const [part, agg] of Object.entries(spareByPart)){
    findings.push(mkFinding({kind:'unassigned_seats', sku:part, seats:agg.seats,
      monthly: agg.seats*skuPrice(part), confidence:'certain',
      detail:`${agg.seats} of ${agg.purchased} purchased seats are not assigned to any user.`,
      evidence:{purchased:agg.purchased, assigned:agg.assigned}}));
  }

  for(const u of users){
    const assigned = u.assignedLicenses || [];
    if(!assigned.length) continue;
    if((u.userType || '').toLowerCase() === 'guest') continue;
    const heldIds = assigned.map(a=>a.skuId).filter(id => idx[id]);
    if(!heldIds.length) continue;
    const priced = heldIds.map(id=>idx[id]).filter(s=>isPriced(s.skuPartNumber));
    const upn = u.userPrincipalName, name = u.displayName;

    if(u.isDeleted){
      for(const s of priced){
        findings.push(mkFinding({kind:'deleted_user', sku:s.skuPartNumber, seats:1,
          monthly:skuPrice(s.skuPartNumber), confidence:'certain',
          detail:'Account is deleted but the licence was never released.',
          upn, name, dept:u.department, evidence:{isDeleted:true}}));
      }
      continue;
    }

    if(u.accountEnabled === false){
      for(const s of priced){
        findings.push(mkFinding({kind:'disabled_user', sku:s.skuPartNumber, seats:1,
          monthly:skuPrice(s.skuPartNumber), confidence:'certain',
          detail:'Account is disabled but still consumes a paid license.',
          upn, name, dept:u.department, evidence:{accountEnabled:false}}));
      }
      continue;
    }

    if(signInAvailable){
      const last = lastActivity(u);
      const created = parseDt(u.createdDateTime);
      if(last === null){
        if(created && created.getTime() < graceCut){
          for(const s of priced){
            findings.push(mkFinding({kind:'never_signed_in', sku:s.skuPartNumber, seats:1,
              monthly:skuPrice(s.skuPartNumber), confidence:'high',
              detail:`Licensed account has never recorded a sign-in (created ${created.toISOString().slice(0,10)}).`,
              upn, name, dept:u.department, evidence:{createdDateTime:u.createdDateTime}}));
          }
        }
      } else if(last.getTime() < dormantCut){
        const daysIdle = Math.floor((now - last.getTime())/864e5);
        for(const s of priced){
          findings.push(mkFinding({kind:'dormant_user', sku:s.skuPartNumber, seats:1,
            monthly:skuPrice(s.skuPartNumber), confidence:'high',
            detail:`No interactive or background sign-in in ${daysIdle} days.`,
            upn, name, dept:u.department, evidence:{lastActivity:last.toISOString(), daysIdle}}));
        }
      }
    }

    for(const cand of priced){
      let done = false;
      for(const otherId of heldIds){
        const other = idx[otherId];
        if(other.skuId === cand.skuId) continue;
        if(!cand.planIds.size || !other.planIds.size) continue;
        const subset = [...cand.planIds].every(p => other.planIds.has(p));
        const strict = subset && cand.planIds.size < other.planIds.size;
        if(strict){
          findings.push(mkFinding({kind:'redundant_sku', sku:cand.skuPartNumber, seats:1,
            monthly:skuPrice(cand.skuPartNumber), confidence:'review',
            detail:`Every service in ${skuName(cand.skuPartNumber)} is already included in `+
                   `${skuName(other.skuPartNumber)}, which this user also holds.`,
            upn, name, dept:u.department, evidence:{supersededBy:other.skuPartNumber}}));
          done = true; break;
        }
      }
      if(done) continue;
    }
  }

  findings.sort((a,b)=>b.annual_cost - a.annual_cost);
  const monthly = +findings.reduce((s,f)=>s+f.monthly_cost,0).toFixed(2);

  const warnings = [];
  if(!signInAvailable){
    warnings.push('Sign-in activity was unavailable for this tenant, so dormant and '+
      'never-signed-in accounts could not be detected. The real figure is almost certainly higher.');
  }
  const unknown = [...new Set(Object.values(idx)
    .filter(s=>!isPriced(s.skuPartNumber) && s.enabled>0).map(s=>s.skuPartNumber))];
  if(unknown.length){
    warnings.push('No price on file for: '+unknown.sort().slice(0,15).join(', ')+
      '. These are excluded from the totals.');
  }

  const skuSummary = Object.values(idx).map(s=>({
    skuPartNumber:s.skuPartNumber, displayName:skuName(s.skuPartNumber),
    purchased:s.enabled, assigned:s.consumed, spare:s.enabled-s.consumed,
    unitPrice:skuPrice(s.skuPartNumber),
    monthlySpend:+(s.enabled*skuPrice(s.skuPartNumber)).toFixed(2)
  })).sort((a,b)=>b.monthlySpend-a.monthlySpend);

  return {
    scanned_at:new Date().toISOString(), sign_in_data_available:signInAvailable,
    dormant_threshold_days:dormantDays, total_users:users.length,
    licensed_users:users.filter(u=>(u.assignedLicenses||[]).length).length,
    annual_waste_usd:+(monthly*12).toFixed(2), monthly_waste_usd:monthly,
    annual_spend_usd:+(skuSummary.reduce((s,x)=>s+x.monthlySpend,0)*12).toFixed(2),
    findings, sku_summary:skuSummary, warnings
  };
}
if(typeof module !== 'undefined') module.exports = { analyze, skuName, skuPrice, isPriced, SKU_CATALOG };
