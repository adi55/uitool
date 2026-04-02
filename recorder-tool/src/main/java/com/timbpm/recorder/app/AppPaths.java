package com.timbpm.recorder.app;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public record AppPaths(
    Path root,
    Path toolRoot,
    Path profilesDir,
    Path extensionDir,
    Path examplesDir,
    Path generatedDir,
    Path distDir
) {
    public static AppPaths discover() {
        Path root = Paths.get("").toAbsolutePath().normalize();
        Path toolRoot = root.resolve("recorder-tool");
        AppPaths paths = new AppPaths(
            root,
            toolRoot,
            toolRoot.resolve("profiles"),
            toolRoot.resolve("chrome-extension"),
            toolRoot.resolve("examples"),
            toolRoot.resolve("generated"),
            root.resolve("dist")
        );
        paths.ensureDirectories();
        return paths;
    }

    public void ensureDirectories() {
        try {
            Files.createDirectories(toolRoot);
            Files.createDirectories(profilesDir);
            Files.createDirectories(extensionDir);
            Files.createDirectories(examplesDir);
            Files.createDirectories(generatedDir);
            Files.createDirectories(distDir);
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to create recorder directories", exception);
        }
    }
}
