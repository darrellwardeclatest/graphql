/*
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    DirectiveNode,
    DocumentNode,
    FieldDefinitionNode,
    Kind,
    ObjectTypeDefinitionNode,
    UnionTypeDefinitionNode,
} from "graphql";
import { SCALAR_TYPES } from "../constants";
import { getDefinitionNodes } from "../schema/get-definition-nodes";
import getFieldTypeMeta from "../schema/get-field-type-meta";
import { filterTruthy } from "../utils/utils";
import type { Annotation } from "./annotation/Annotation";
import { CypherAnnotation } from "./annotation/CypherAnnotation";
import { Attribute } from "./attribute/Attribute";
import { CompositeEntity } from "./entity/CompositeEntity";
import { ConcreteEntity } from "./entity/ConcreteEntity";
import type { Entity } from "./entity/Entity";
import { Neo4jGraphQLSchemaModel } from "./Neo4jGraphQLSchemaModel";

export function generateModel(document: DocumentNode): Neo4jGraphQLSchemaModel {
    const definitionNodes = getDefinitionNodes(document);
    const concreteEntities = definitionNodes.objectTypes.map(generateConcreteEntity).reduce((acc, entity) => {
        if (acc.has(entity.name)) {
            throw new Error(`Duplicate node ${entity.name}`);
        }
        acc.set(entity.name, entity);
        return acc;
    }, new Map<string, ConcreteEntity>());

    const compositeEntities = definitionNodes.unionTypes
        .map((entity) => {
            return generateCompositeEntity(entity, concreteEntities);
        })
        .reduce((acc, entity) => {
            acc.set(entity.name, entity);
            return acc;
        }, new Map<string, CompositeEntity>());

    const entities = new Map<string, Entity>([...concreteEntities, ...compositeEntities]);
    return new Neo4jGraphQLSchemaModel(entities);
}

function generateCompositeEntity(
    definition: UnionTypeDefinitionNode,
    concreteEntities: Map<string, ConcreteEntity>
): CompositeEntity {
    const compositeFields = (definition.types || []).map((type) => {
        const concreteEntity = concreteEntities.get(type.name.value);
        if (!concreteEntity) {
            throw new Error(`Could not find concrete entity with name ${type.name.value}`);
        }
        return concreteEntity;
    });

    if (!compositeFields.length) {
        throw new Error(`Composite entity ${definition.name.value} has no concrete entities`);
    }
    return new CompositeEntity({
        name: definition.name.value,
        concreteEntities: compositeFields,
    });
}

function generateConcreteEntity(definition: ObjectTypeDefinitionNode): ConcreteEntity {
    const fields = (definition.fields || []).map(generateField);

    return new ConcreteEntity({
        name: definition.name.value,
        attributes: filterTruthy(fields),
    });
}

function generateField(field: FieldDefinitionNode): Attribute | undefined {
    const typeMeta = getFieldTypeMeta(field.type); // TODO: without originalType
    if (SCALAR_TYPES.includes(typeMeta.name)) {
        const annotations = createFieldAnnotations(field.directives || []);
        return new Attribute({
            name: field.name.value,
            annotations,
        });
    }
}

function createFieldAnnotations(directives: readonly DirectiveNode[]): Annotation[] {
    return filterTruthy(
        directives.map((directive) => {
            switch (directive.name.value) {
                case "cypher":
                    return parseCypherAnnotation(directive);
                default:
                    return undefined;
            }
        })
    );
}

function parseCypherAnnotation(directive: DirectiveNode): CypherAnnotation {
    const { statement } = parseArguments(directive);
    if (!statement || typeof statement !== "string") {
        throw new Error("@cypher statement required");
    }
    return new CypherAnnotation({
        statement: statement,
    });
}

function parseArguments(directive: DirectiveNode): Record<string, unknown> {
    return (directive.arguments || [])?.reduce((acc, argument) => {
        if (argument.value.kind === Kind.STRING) {
            // TODO: parse other kinds
            acc[argument.name.value] = argument.value.value;
        }
        return acc;
    }, {});
}