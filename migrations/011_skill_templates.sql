-- Marketing Skills
INSERT INTO skills (name, category, description, prompt) VALUES
('Social Media Post Idea Generator', 'Marketing', 'Generiert kreative Ideen für Social-Media-Posts zu einem bestimmten Thema.', 'Erstelle 5 Social-Media-Post-Ideen für ein neues, umweltfreundliches Reinigungsprodukt. Zielgruppe sind junge Familien. Tonalität: frisch und humorvoll.'),
('Blog Post SEO Title Creator', 'Marketing', 'Erstellt SEO-optimierte Titel für Blog-Posts, um die Klickrate zu erhöhen.', 'Generiere 10 SEO-freundliche Titel für einen Blog-Post über ''Die Vorteile von Remote-Arbeit für kleine Unternehmen''.');

-- Code Skills
INSERT INTO skills (name, category, description, prompt) VALUES
('Regex Generator', 'Code', 'Erstellt reguläre Ausdrücke basierend auf einer Beschreibung.', 'Erstelle einen regulären Ausdruck, der E-Mail-Adressen validiert.'),
('Code Documentation Writer', 'Code', 'Schreibt Dokumentation für eine gegebene Code-Funktion.', 'Dokumentiere die folgende Python-Funktion. Erkläre, was sie tut, ihre Parameter und was sie zurückgibt: `def calculate_sum(a, b): return a + b`');

-- SEO Skills
INSERT INTO skills (name, category, description, prompt) VALUES
('Keyword Research Assistant', 'SEO', 'Findet relevante Keywords für ein bestimmtes Thema oder eine Nische.', 'Finde 15 Long-Tail-Keywords für einen Online-Shop, der handgemachten Schmuck verkauft.'),
('Meta Description Writer', 'SEO', 'Schreibt überzeugende Meta-Beschreibungen für Webseiten, um die CTR in Suchergebnissen zu verbessern.', 'Schreibe eine Meta-Beschreibung (max. 155 Zeichen) für die Homepage eines Yoga-Studios in Berlin, das Vinyasa- und Hatha-Yoga anbietet.');

-- Design Skills
INSERT INTO skills (name, category, description, prompt) VALUES
('Color Palette Generator', 'Design', 'Erstellt Farbpaletten basierend auf einer Stimmung oder einem Thema.', 'Erstelle eine Farbpalette mit 5 Farben für eine Website über Natur und Nachhaltigkeit. Die Stimmung sollte ruhig und vertrauensvoll sein.'),
('Logo Idea Generator', 'Design', 'Generiert Konzepte und Ideen für ein Logo.', 'Gib mir 3 Logo-Konzepte für ein neues Café namens ''The Daily Grind''. Es soll modern, minimalistisch und freundlich wirken.');

-- Finance Skills
INSERT INTO skills (name, category, description, prompt) VALUES
('Business Model Canvas Assistant', 'Finance', 'Hilft beim Ausfüllen der verschiedenen Bereiche eines Business Model Canvas.', 'Hilf mir, das ''Value Proposition''-Segment des Business Model Canvas für eine App zu definieren, die Studenten mit Tutoren verbindet.'),
('Invoice Template Generator', 'Finance', 'Erstellt eine einfache Rechnungsvorlage im Textformat.', 'Erstelle eine Rechnungsvorlage für einen freiberuflichen Grafikdesigner. Sie sollte Felder für den Kunden, die erbrachten Leistungen, den Betrag und die Zahlungsbedingungen enthalten.');
