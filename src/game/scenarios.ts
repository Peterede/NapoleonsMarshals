import type { Scenario } from './types';

/**
 * Maps are authored as odd-r offset rows. Legend:
 *   .  open grass      ,  wheat field     f  wood
 *   ^  height          #  village         ~  water
 *   =  ford / bridge   m  marsh
 */
export const SCENARIOS: Scenario[] = [
  {
    id: 'lodi',
    title: 'The Bridge at Lodi',
    subtitle: "Bonaparte's first laurels",
    date: '10 May 1796',
    place: 'Lodi, Lombardy',
    command: "Armée d'Italie",
    intro:
      'The Austrian rear guard has fallen back across the Adda and holds the bridge at Lodi. General Bonaparte will not let them slip away. Seize the bridge and the town beyond it before the enemy completes their retreat.',
    history:
      'At Lodi, a 29-year-old Bonaparte stormed a narrow wooden bridge under murderous fire. The audacity of the attack — and the legend that grew around it — convinced the army that its little corporal was destined for greater things.',
    turnLimit: 10,
    aiStance: 'defend',
    map: [
      '..^...##....^...',
      '..^....#....^...',
      '..ff........^^..',
      '.....,,.........',
      '~~~~~~~==~~~~~~~',
      '.......,,.......',
      '..ff.....,,...f.',
      '........,.......',
      '..^.....#.......',
      '...^............',
    ],
    objectives: [
      { id: 'bridge', name: 'Lodi Bridge', col: 7, row: 4, owner: 'coalition' },
      { id: 'town', name: 'Lodi Town', col: 6, row: 0, owner: 'coalition' },
    ],
    units: [
      { name: 'Bonaparte', type: 'commander', nation: 'france', col: 7, row: 9 },
      { name: '1er Régiment de Ligne', type: 'line', nation: 'france', col: 5, row: 8 },
      { name: '32e Régiment de Ligne', type: 'line', nation: 'france', col: 9, row: 8 },
      { name: 'Carabiniers', type: 'light', nation: 'france', col: 6, row: 9 },
      { name: 'Chevau-légers', type: 'cavalry', nation: 'france', col: 2, row: 9 },
      { name: 'Batterie de Lodi', type: 'artillery', nation: 'france', col: 12, row: 8 },
      { name: 'Sebottendorf', type: 'commander', nation: 'coalition', col: 7, row: 1, quality: 3 },
      { name: 'Erzherzog Karl Regiment', type: 'line', nation: 'coalition', col: 8, row: 2 },
      { name: 'Strassoldo Regiment', type: 'line', nation: 'coalition', col: 6, row: 2 },
      { name: 'Grenzer Detachment', type: 'light', nation: 'coalition', col: 4, row: 3 },
      { name: 'Austrian Battery', type: 'artillery', nation: 'coalition', col: 8, row: 3 },
    ],
    hints: [
      'The bridge is a killing ground. Bring your guns up to soften its defenders before you cross.',
      'Cavalry cannot cross a defended bridge alone — let the infantry lead, then ride down the guns.',
      'You must hold every objective at the end of a full turn. A single regiment on the bridge can secure it.',
    ],
  },
  {
    id: 'austerlitz',
    title: 'The Sun of Austerlitz',
    subtitle: 'The Pratzen Heights',
    date: '2 December 1805',
    place: 'Austerlitz, Moravia',
    command: 'Grande Armée',
    intro:
      'The allied armies of Russia and Austria have taken the Pratzen Heights. Napoleon has deliberately weakened his right to lure them down. Now the Grande Armée must storm the plateau, take the villages, and break the coalition centre before the trap closes.',
    history:
      "Austerlitz is Napoleon's masterpiece. He surrendered the heights to invite an allied attack, then hurled Soult's corps into the allied centre at dawn. The 'sun of Austerlitz' broke through the fog as the French columns crested the plateau.",
    turnLimit: 12,
    aiStance: 'defend',
    map: [
      '...^^^....##......',
      '..^^^^...####.....',
      '..^^^....###..^^..',
      '...^......,....^..',
      '....,,....,.......',
      '...ff.....,..ff...',
      '..ff......#....f..',
      '......,,..........',
      '.^....,,.....^....',
      '.^...ff...........',
      '......~~....~~....',
      '.....~~~....~~~...',
    ],
    objectives: [
      { id: 'heights', name: 'Pratzen Heights', col: 4, row: 1, owner: 'coalition' },
      { id: 'village', name: 'Pratzen Village', col: 10, row: 6, owner: 'coalition' },
      { id: 'staré', name: 'Staré Vinohrady', col: 14, row: 2, owner: 'coalition' },
    ],
    units: [
      { name: 'Napoléon', type: 'commander', nation: 'france', col: 8, row: 9 },
      { name: '1er Régiment de Ligne', type: 'line', nation: 'france', col: 4, row: 8 },
      { name: '2e Régiment de Ligne', type: 'line', nation: 'france', col: 7, row: 9 },
      { name: '3e Régiment de Ligne', type: 'line', nation: 'france', col: 10, row: 9 },
      { name: 'Garde Impériale', type: 'guard', nation: 'france', col: 9, row: 8 },
      { name: 'Tirailleurs du Midi', type: 'light', nation: 'france', col: 3, row: 9 },
      { name: '1er Cuirassiers', type: 'cavalry', nation: 'france', col: 2, row: 8 },
      { name: '10e Hussards', type: 'cavalry', nation: 'france', col: 12, row: 9 },
      { name: 'Grande Batterie', type: 'artillery', nation: 'france', col: 11, row: 9 },
      { name: 'Kutuzov', type: 'commander', nation: 'coalition', col: 7, row: 2, quality: 3 },
      { name: 'Moscow Regiment', type: 'line', nation: 'coalition', col: 6, row: 2 },
      { name: 'Smolensk Regiment', type: 'line', nation: 'coalition', col: 11, row: 2 },
      { name: 'Austerlitz Regiment', type: 'line', nation: 'coalition', col: 12, row: 2 },
      { name: 'Russian Guard', type: 'guard', nation: 'coalition', col: 10, row: 1, quality: 4 },
      { name: 'Grenzer Skirmishers', type: 'light', nation: 'coalition', col: 5, row: 3 },
      { name: 'Russian Battery', type: 'artillery', nation: 'coalition', col: 8, row: 2 },
      { name: 'Cuirassiers of the Guard', type: 'cavalry', nation: 'coalition', col: 14, row: 3, quality: 4 },
    ],
    hints: [
      'The heights are the key. Take them and the allied centre will fold.',
      'Columns are made for the assault — but allied guns will tear them apart on open ground.',
      'Keep a regiment in reserve for the village; the allies will counter-attack to retake it.',
    ],
  },
  {
    id: 'waterloo',
    title: 'The Last Square',
    subtitle: 'Waterloo, 1815',
    date: '18 June 1815',
    place: 'Mont-Saint-Jean, Brabant',
    command: 'Armée du Nord',
    intro:
      'The Emperor has one army left, and Wellington has chosen his ground. The Anglo-Allied line waits behind the ridge, with the farms of Hougoumont and La Haye Sainte thrown forward as bastions. Break the ridge before the Prussians arrive, or the Empire falls with the sun.',
    history:
      "Waterloo was the last gamble of the Hundred Days. Repeated French assaults broke against Wellington's ridge and the stubborn garrisons of the farms. Late in the day the Prussians arrived, the Guard fell back, and the Grande Armée dissolved.",
    turnLimit: 13,
    aiStance: 'counter',
    map: [
      '........###.......',
      '...^^^..###..^^^..',
      '..^^^^...^...^^^..',
      '..,,,.....,...,,..',
      '...f..,,###,,..f..',
      '..f#f...,,,...f...',
      '..fff...,,,...fff.',
      '.....,,,,,,,,.....',
      '...,,,......,,,...',
      '..................',
      '....,,......,,....',
      '..................',
    ],
    objectives: [
      { id: 'hougoumont', name: 'Hougoumont', col: 3, row: 5, owner: 'coalition' },
      { id: 'haye', name: 'La Haye Sainte', col: 9, row: 4, owner: 'coalition' },
      { id: 'crossroads', name: 'Mont-Saint-Jean', col: 9, row: 0, owner: 'coalition' },
    ],
    units: [
      { name: 'Napoléon', type: 'commander', nation: 'france', col: 9, row: 10 },
      { name: '1er Régiment de Ligne', type: 'line', nation: 'france', col: 4, row: 9 },
      { name: '2e Régiment de Ligne', type: 'line', nation: 'france', col: 7, row: 9 },
      { name: '3e Régiment de Ligne', type: 'line', nation: 'france', col: 11, row: 9 },
      { name: '4e Régiment de Ligne', type: 'line', nation: 'france', col: 13, row: 8 },
      { name: 'Garde Impériale', type: 'guard', nation: 'france', col: 9, row: 11 },
      { name: 'Tirailleurs de la Garde', type: 'light', nation: 'france', col: 3, row: 10 },
      { name: '1er Cuirassiers', type: 'cavalry', nation: 'france', col: 2, row: 9 },
      { name: '4e Hussards', type: 'cavalry', nation: 'france', col: 15, row: 10 },
      { name: 'Grande Batterie', type: 'artillery', nation: 'france', col: 6, row: 8 },
      { name: 'Wellington', type: 'commander', nation: 'coalition', col: 9, row: 2, quality: 4 },
      { name: '1st Foot Guards', type: 'guard', nation: 'coalition', col: 9, row: 1, quality: 4 },
      { name: 'Royal Scots', type: 'line', nation: 'coalition', col: 6, row: 2, quality: 4 },
      { name: 'Black Watch', type: 'line', nation: 'coalition', col: 11, row: 2, quality: 4 },
      { name: 'Nassau Contingent', type: 'line', nation: 'coalition', col: 5, row: 3 },
      { name: 'Hanoverian Line', type: 'line', nation: 'coalition', col: 12, row: 3 },
      { name: '95th Rifles', type: 'light', nation: 'coalition', col: 5, row: 5, quality: 4 },
      { name: 'Scots Greys', type: 'cavalry', nation: 'coalition', col: 13, row: 2, quality: 4 },
      { name: 'Royal Horse Artillery', type: 'artillery', nation: 'coalition', col: 7, row: 2 },
      { name: 'Dutch Battery', type: 'artillery', nation: 'coalition', col: 12, row: 2 },
    ],
    hints: [
      'Hougoumont and La Haye Sainte are fortresses. Mask them with skirmishers and guns rather than feeding columns into the walls.',
      'The allied cavalry will punish any column caught in the open. Form square before the horse come on.',
      'Mont-Saint-Jean lies behind the ridge. Break the centre and the whole line will unravel.',
    ],
  },
];

export function getScenario(id: string): Scenario {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  return scenario;
}
