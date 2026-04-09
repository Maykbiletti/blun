const fs = require('fs');
const path = require('path');

const SKILLS_DIR = '/root/blun/skills';

function loadSkill(skillName) {
    const skillPath = path.join(SKILLS_DIR, `${skillName}.json`);

    try {
        const skillData = fs.readFileSync(skillPath, 'utf8');
        return JSON.parse(skillData);
    } catch (error) {
        throw new Error(`Failed to load skill "${skillName}": ${error.message}`);
    }
}

function getAvailableSkills() {
    try {
        const files = fs.readdirSync(SKILLS_DIR);
        return files
            .filter(file => file.endsWith('.json'))
            .map(file => path.basename(file, '.json'));
    } catch (error) {
        throw new Error(`Failed to read skills directory: ${error.message}`);
    }
}

module.exports = {
    loadSkill,
    getAvailableSkills
};