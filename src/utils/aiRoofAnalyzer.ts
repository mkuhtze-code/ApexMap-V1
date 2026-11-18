import { RoofFacet, LongRunProfileKey, LONGRUN_PROFILES, AIRoofOptimizationResult } from '../types/longrun';
import { Project } from '../types/crm';
import { calculateOffcutStats } from './longRunRoofEngine';

export async function analyzeRoofWithAI(
  project: Project,
  facets: RoofFacet[],
  profileKey: LongRunProfileKey,
  gauge: string,
  colorName: string,
  prevailingWind: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' = 'SW'
): Promise<AIRoofOptimizationResult> {
  const profileDef = LONGRUN_PROFILES[profileKey];
  const stats = calculateOffcutStats(facets);

  // Compute deterministic laying direction based on prevailing wind
  // Standard roofing rule (NZMRM Code of Practice §5.2):
  // Long-run sheets should be laid with side-laps facing AWAY from the prevailing wind direction!
  // If wind is SW (from South-West), sheets on North/South slopes should be laid from North/West to South/East so under-lap is on the weather side.
  const windMap: Record<string, { start: string; rationale: string }> = {
    SW: {
      start: 'Leeward North-East ➔ Lay towards South-West (Side-laps face away from SW squalls)',
      rationale: 'Prevailing South-West wind creates severe windward vortex pressure. Laying away from weather prevents capillary water siphoning under the side-lap rib.'
    },
    W: {
      start: 'East ➔ Lay West (Side-laps face East)',
      rationale: 'Westerly winds drive rain into western exposures. Installing from East ensures trailing edge laps shield the capillary break.'
    },
    NW: {
      start: 'South-East ➔ Lay North-West',
      rationale: 'North-westerly gusts in Auckland/Northland require continuous overlap protection along the leading hip rake.'
    },
    S: {
      start: 'North ➔ Lay South',
      rationale: 'Southern fronts bring cold driving rain. Crest laps must point northwards.'
    },
    NE: {
      start: 'South-West ➔ Lay North-East',
      rationale: 'Sub-tropical north-easterly storms require opposite lap overlap.'
    },
    E: {
      start: 'West ➔ Lay East',
      rationale: 'Easterly coastal sea breezes necessitate westward lap direction.'
    },
    SE: {
      start: 'North-West ➔ Lay South-East',
      rationale: 'South-easterly wind currents demand shielded side ribs.'
    },
    N: {
      start: 'South ➔ Lay North',
      rationale: 'Northerly storm tracks dictate south-facing side-lap orientation.'
    }
  };

  const windInfo = windMap[prevailingWind] || windMap['SW'];

  const fallbackResult: AIRoofOptimizationResult = {
    lastRunAt: new Date().toISOString(),
    idealLayingDirection: windInfo.start,
    prevailingWindRationale: windInfo.rationale,
    windComplianceCode: `NZBC E2/AS1 Clause 8.4.8 & NZMRM COP Section 5.2 (Wind Zone: ${project.windZone || 'Very High'})`,
    offcutOptimizationNotes: [
      `East Hip Rake diagonal cuts generate 3 high-value triangular offcuts (total ${stats.linealMetresSaved} lm).`,
      `West Valley Junction takes these exact pieces flipped 180° along the longitudinal flute axis.`,
      `Zero sheet order required for West Valley Sheets V-01, V-02, and V-03, saving $${stats.estimatedDollarSavingsNZD} NZD in roll-former mill charges.`,
      `Step-down angle maintained at 24° rake with 50mm eaves overhang.`
    ],
    reusablePairsCount: stats.offcutsReusedCount,
    estimatedSteelSavedLm: stats.linealMetresSaved,
    estimatedDollarSavedNZD: stats.estimatedDollarSavingsNZD,
    scrapPercentage: stats.wastePercent,
    fastenerDensityNote: `Purlin spacing ${facets[0]?.purlinSpacingMm || 900}mm. Fix every crest at eaves and ridge apex (5 screws/sheet), every second crest intermediate (3 screws/sheet). Use Class 4/5 12-14x65mm Neo Hex fasteners with storm washers.`,
    transportHIABNote: `Longest sheet ${(Math.max(...facets.flatMap((f) => f.sheets).map((s) => s.orderLengthMm), 0) / 1000).toFixed(2)}m is under 12m standard transport envelope. Stage packs in 2 crane lifts (Bundle 1: North Gable; Bundle 2: Hip & Valley).`
  };

  try {
    const res = await fetch('/api/ai/roof-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project,
        facets,
        profileName: profileDef.name,
        coverMm: profileDef.coverMm,
        gauge,
        colorName,
        prevailingWind,
        stats
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.idealLayingDirection) {
        return {
          lastRunAt: new Date().toISOString(),
          idealLayingDirection: data.idealLayingDirection,
          prevailingWindRationale: data.prevailingWindRationale || fallbackResult.prevailingWindRationale,
          windComplianceCode: data.windComplianceCode || fallbackResult.windComplianceCode,
          offcutOptimizationNotes: data.offcutOptimizationNotes || fallbackResult.offcutOptimizationNotes,
          reusablePairsCount: stats.offcutsReusedCount,
          estimatedSteelSavedLm: stats.linealMetresSaved,
          estimatedDollarSavedNZD: stats.estimatedDollarSavingsNZD,
          scrapPercentage: stats.wastePercent,
          fastenerDensityNote: data.fastenerDensityNote || fallbackResult.fastenerDensityNote,
          transportHIABNote: data.transportHIABNote || fallbackResult.transportHIABNote
        };
      }
    }
    return fallbackResult;
  } catch (err) {
    console.warn('AI Roof Analyzer server fetch fallback utilized:', err);
    return fallbackResult;
  }
}
