import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');

interface ValidationResult {
  file: string;
  valid: boolean;
  itemCount?: number;
  errors: string[];
}

function validateItems(data: any[]): string[] {
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push('Items data is not an array');
    return errors;
  }

  data.forEach((item, index) => {
    if (!item.id) errors.push(`Item at index ${index} missing id`);
    if (!item.name) errors.push(`Item ${item.id || index} missing name`);
    if (!item.rarity) errors.push(`Item ${item.id || index} missing rarity`);
    if (typeof item.value !== 'number') errors.push(`Item ${item.id || index} has invalid value`);
  });

  return errors;
}

function validateHideoutModules(data: any[]): string[] {
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push('Hideout modules data is not an array');
    return errors;
  }

  data.forEach((module, index) => {
    if (!module.id) errors.push(`Module at index ${index} missing id`);
    if (!module.name) errors.push(`Module ${module.id || index} missing name`);
    if (!Array.isArray(module.levels)) {
      errors.push(`Module ${module.id || index} missing levels array`);
    }
  });

  return errors;
}

function validateQuests(data: any[]): string[] {
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push('Quests data is not an array');
    return errors;
  }

  data.forEach((quest, index) => {
    if (!quest.id) errors.push(`Quest at index ${index} missing id`);
    if (!quest.name) errors.push(`Quest ${quest.id || index} missing name`);
  });

  return errors;
}

function validateProjects(data: any[]): string[] {
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push('Projects data is not an array');
    return errors;
  }

  data.forEach((project, index) => {
    if (!project.id) errors.push(`Project at index ${index} missing id`);
    if (!project.name) errors.push(`Project ${project.id || index} missing name`);
  });

  return errors;
}

function validateFile(filename: string, validator: (data: any) => string[]): ValidationResult {
  const filepath = path.join(DATA_DIR, filename);
  const result: ValidationResult = {
    file: filename,
    valid: true,
    errors: []
  };

  try {
    if (!fs.existsSync(filepath)) {
      result.valid = false;
      result.errors.push('File does not exist');
      return result;
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const data = JSON.parse(content);

    result.itemCount = Array.isArray(data) ? data.length : undefined;
    result.errors = validator(data);
    result.valid = result.errors.length === 0;

  } catch (error) {
    result.valid = false;
    result.errors.push(`Failed to parse: ${error}`);
  }

  return result;
}

function main() {
  console.log('🔍 Validating Arc Raiders data files...\n');

  const validations: ValidationResult[] = [
    validateFile('items.json', validateItems),
    validateFile('hideoutModules.json', validateHideoutModules),
    validateFile('quests.json', validateQuests),
    validateFile('projects.json', validateProjects)
  ];

  let allValid = true;

  validations.forEach(result => {
    if (result.valid) {
      console.log(`✅ ${result.file} - Valid (${result.itemCount || 0} entries)`);
    } else {
      console.log(`❌ ${result.file} - Invalid`);
      result.errors.forEach(error => {
        console.log(`   - ${error}`);
      });
      allValid = false;
    }
  });

  console.log('');

  if (allValid) {
    console.log('✨ All data files validated successfully!');
    process.exit(0);
  } else {
    console.log('⚠️  Some data files have validation errors');
    process.exit(1);
  }
}

main();
