/**
 * The subject collections of bioRxiv and medRxiv: the site's URL slug, its
 * display name, and the category name the `api.biorxiv.org` details endpoint
 * takes. Checked against both sites and the API on 2026-10-28. The API
 * silently falls back to every category for a name it does not know, so this
 * map is the only place a subject is accepted.
 */

/** The two preprint servers this adapter reads. */
export type BiorxivServer = 'biorxiv' | 'medrxiv';

export const BIORXIV_SERVERS: readonly BiorxivServer[] = ['biorxiv', 'medrxiv'];

/** A subject: `[site slug, display name, API category name?]` (the API name defaults to the slug with `_` for `-`). */
type SubjectEntry = readonly [slug: string, title: string, apiName?: string];

const SUBJECTS: Record<BiorxivServer, readonly SubjectEntry[]> = {
  // bioRxiv's legacy Clinical Trials and Epidemiology subjects moved to
  // medRxiv; the API no longer has them, so they are left out.
  biorxiv: [
    ['animal-behavior-and-cognition', 'Animal Behavior and Cognition'],
    ['biochemistry', 'Biochemistry'],
    ['bioengineering', 'Bioengineering'],
    ['bioinformatics', 'Bioinformatics'],
    ['biophysics', 'Biophysics'],
    ['cancer-biology', 'Cancer Biology'],
    ['cell-biology', 'Cell Biology'],
    ['developmental-biology', 'Developmental Biology'],
    ['ecology', 'Ecology'],
    ['evolutionary-biology', 'Evolutionary Biology'],
    ['genetics', 'Genetics'],
    ['genomics', 'Genomics'],
    ['immunology', 'Immunology'],
    ['microbiology', 'Microbiology'],
    ['molecular-biology', 'Molecular Biology'],
    ['neuroscience', 'Neuroscience'],
    ['paleontology', 'Paleontology'],
    ['pathology', 'Pathology'],
    ['pharmacology-and-toxicology', 'Pharmacology and Toxicology'],
    ['physiology', 'Physiology'],
    ['plant-biology', 'Plant Biology'],
    ['scientific-communication-and-education', 'Scientific Communication and Education'],
    ['synthetic-biology', 'Synthetic Biology'],
    ['systems-biology', 'Systems Biology'],
    ['zoology', 'Zoology'],
  ],
  medrxiv: [
    ['addiction-medicine', 'Addiction Medicine'],
    ['allergy-and-immunology', 'Allergy and Immunology'],
    ['anesthesia', 'Anesthesia'],
    ['cardiovascular-medicine', 'Cardiovascular Medicine'],
    ['dentistry-and-oral-medicine', 'Dentistry and Oral Medicine'],
    ['dermatology', 'Dermatology'],
    ['emergency-medicine', 'Emergency Medicine'],
    [
      'endocrinology-including-diabetes-mellitus-and-metabolic-disease',
      'Endocrinology (including Diabetes Mellitus and Metabolic Disease)',
      'endocrinology',
    ],
    ['epidemiology', 'Epidemiology'],
    ['forensic-medicine', 'Forensic Medicine'],
    ['gastroenterology', 'Gastroenterology'],
    ['genetic-and-genomic-medicine', 'Genetic and Genomic Medicine'],
    ['geriatric-medicine', 'Geriatric Medicine'],
    ['health-economics', 'Health Economics'],
    ['health-informatics', 'Health Informatics'],
    ['health-policy', 'Health Policy'],
    ['health-systems-and-quality-improvement', 'Health Systems and Quality Improvement'],
    ['hematology', 'Hematology'],
    ['hiv-aids', 'HIV/AIDS'],
    ['infectious_diseases', 'Infectious Diseases (except HIV/AIDS)'],
    ['intensive-care-and-critical-care-medicine', 'Intensive Care and Critical Care Medicine'],
    ['medical-education', 'Medical Education'],
    ['medical-ethics', 'Medical Ethics'],
    ['nephrology', 'Nephrology'],
    ['neurology', 'Neurology'],
    ['nursing', 'Nursing'],
    ['nutrition', 'Nutrition'],
    ['obstetrics-and-gynecology', 'Obstetrics and Gynecology'],
    ['occupational-and-environmental-health', 'Occupational and Environmental Health'],
    ['oncology', 'Oncology'],
    ['ophthalmology', 'Ophthalmology'],
    ['orthopedics', 'Orthopedics'],
    ['otolaryngology', 'Otolaryngology'],
    ['pain-medicine', 'Pain Medicine'],
    ['palliative-medicine', 'Palliative Medicine'],
    ['pathology', 'Pathology'],
    ['pediatrics', 'Pediatrics'],
    ['pharmacology-and-therapeutics', 'Pharmacology and Therapeutics'],
    ['primary-care-research', 'Primary Care Research'],
    ['psychiatry-and-clinical-psychology', 'Psychiatry and Clinical Psychology'],
    ['public-and-global-health', 'Public and Global Health'],
    ['radiology-and-imaging', 'Radiology and Imaging'],
    [
      'rehabilitation-medicine-and-physical-therapy',
      'Rehabilitation Medicine and Physical Therapy',
    ],
    ['respiratory-medicine', 'Respiratory Medicine'],
    ['rheumatology', 'Rheumatology'],
    ['sexual-and-reproductive-health', 'Sexual and Reproductive Health'],
    ['sports-medicine', 'Sports Medicine'],
    ['surgery', 'Surgery'],
    ['toxicology', 'Toxicology'],
    ['transplantation', 'Transplantation'],
    ['urology', 'Urology'],
  ],
};

/** A subject collection on one server. */
export interface BiorxivSubject {
  server: BiorxivServer;
  /** The site's URL slug (`neuroscience`, `infectious_diseases`). */
  slug: string;
  /** The display name (`Neuroscience`). */
  title: string;
  /** The `category` query value the API takes (`infectious_diseases`). */
  apiName: string;
}

/** Slugs compare with `-` and `_` treated alike, and case-insensitively. */
function slugKey(slug: string): string {
  return slug.toLowerCase().replace(/_/g, '-');
}

/** The subject a URL slug names on a server, or `undefined` for an unknown slug. */
export function findSubject(server: BiorxivServer, slug: string): BiorxivSubject | undefined {
  const key = slugKey(slug);
  const entry = SUBJECTS[server].find(([candidate]) => slugKey(candidate) === key);
  if (!entry) return undefined;
  const [canonical, title, apiName] = entry;
  return { server, slug: canonical, title, apiName: apiName ?? canonical.replace(/-/g, '_') };
}

/** Every subject on a server, in site order. */
export function listSubjects(server: BiorxivServer): BiorxivSubject[] {
  return SUBJECTS[server].map(([slug]) => findSubject(server, slug)!);
}

/** The category name the API echoes back for a subject (lowercase, spaces for `_`). */
export function echoedCategory(subject: BiorxivSubject): string {
  return subject.apiName.replace(/_/g, ' ').toLowerCase();
}

/** The server's display name. */
export function serverTitle(server: BiorxivServer): string {
  return server === 'biorxiv' ? 'bioRxiv' : 'medRxiv';
}
