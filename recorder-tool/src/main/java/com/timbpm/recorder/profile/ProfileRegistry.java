package com.timbpm.recorder.profile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;

public final class ProfileRegistry {
    private final Map<String, FrameworkProfile> profiles = new LinkedHashMap<>();

    public void loadFromDirectory(Path directory) throws IOException {
        if (!Files.exists(directory)) {
            return;
        }
        try (var stream = Files.list(directory)) {
            stream
                .sorted()
                .filter(path -> path.getFileName().toString().endsWith(".properties"))
                .forEach(this::loadSingle);
        }
    }

    public FrameworkProfile require(String id) {
        FrameworkProfile profile = profiles.get(id);
        if (profile == null) {
            throw new IllegalArgumentException("Unknown framework profile: " + id);
        }
        return profile;
    }

    public Collection<FrameworkProfile> all() {
        return profiles.values();
    }

    private void loadSingle(Path file) {
        try (InputStream inputStream = Files.newInputStream(file)) {
            Properties properties = new Properties();
            properties.load(inputStream);
            String id = properties.getProperty("profile.id");
            if (id == null || id.isBlank()) {
                throw new IllegalArgumentException("Missing profile.id in " + file);
            }
            FrameworkProfile profile = new FrameworkProfile(id);
            for (String name : properties.stringPropertyNames()) {
                profile.getProperties().put(name, properties.getProperty(name));
            }
            profiles.put(id, profile);
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to load profile " + file, exception);
        }
    }
}
