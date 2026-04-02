package com.timbpm.recorder.io;

import com.timbpm.recorder.model.ScenarioDocument;
import com.timbpm.recorder.model.ScenarioStepIds;
import com.timbpm.recorder.util.DataAccess;
import com.timbpm.recorder.util.StructuredData;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public final class ScenarioIO {
    private ScenarioIO() {
    }

    public static ScenarioDocument read(Path path) throws IOException {
        String fileName = path.getFileName().toString().toLowerCase();
        String content = Files.readString(path, StandardCharsets.UTF_8);
        if (fileName.endsWith(".yaml") || fileName.endsWith(".yml")) {
            return ScenarioDocument.fromMap(DataAccess.map(StructuredData.parseYaml(content)));
        }
        return ScenarioDocument.fromMap(DataAccess.map(StructuredData.parseJson(content)));
    }

    public static void writeJson(Path path, ScenarioDocument document) throws IOException {
        ScenarioStepIds.ensureStepIds(document);
        Files.createDirectories(path.getParent());
        Files.writeString(path, StructuredData.toJson(document.toMap()), StandardCharsets.UTF_8);
    }

    public static void writeYaml(Path path, ScenarioDocument document) throws IOException {
        ScenarioStepIds.ensureStepIds(document);
        Files.createDirectories(path.getParent());
        Files.writeString(path, StructuredData.toYaml(document.toMap()), StandardCharsets.UTF_8);
    }

    public static String toJson(ScenarioDocument document) {
        ScenarioStepIds.ensureStepIds(document);
        return StructuredData.toJson(document.toMap());
    }

    public static String toYaml(ScenarioDocument document) {
        ScenarioStepIds.ensureStepIds(document);
        return StructuredData.toYaml(document.toMap());
    }
}
