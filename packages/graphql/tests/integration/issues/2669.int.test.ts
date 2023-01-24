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

import type { Driver, Session } from "neo4j-driver";
import { graphql } from "graphql";
import Neo4j from "../neo4j";
import { Neo4jGraphQL } from "../../../src/classes";
import { generateUniqueType } from "../../utils/graphql-types";

describe("https://github.com/neo4j/graphql/issues/2669", () => {
    let driver: Driver;
    let neo4j: Neo4j;
    let session: Session;
    let typeDefs: string;

    const typeMovie = generateUniqueType("Movie");
    const typeActor = generateUniqueType("Actor");

    let neoSchema: Neo4jGraphQL;

    beforeAll(async () => {
        neo4j = new Neo4j();
        driver = await neo4j.getDriver();

        typeDefs = `
        type ${typeMovie.name} {
            title: String
            actors: [${typeActor.name}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
        }

        type ${typeActor.name} {
            myName: String @alias(property: "name")
            age: Int
            movies: [${typeMovie.name}!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "ActedIn")
        }

        interface ActedIn {
            time: Int @alias(property: "screentime")
        }
        `;

        neoSchema = new Neo4jGraphQL({ typeDefs });
        session = await neo4j.getSession();
        await session.run(`CREATE (m:${typeMovie.name} { title: "Terminator"})<-[:ACTED_IN { screentime: 60, character: "Terminator" }]-(:${typeActor.name} { name: "Arnold", age: 54, born: datetime('1980-07-02')})
        CREATE (m)<-[:ACTED_IN { screentime: 120, character: "Sarah" }]-(:${typeActor.name} {name: "Linda", age:37, born: datetime('2000-02-02')})`);
    });

    afterAll(async () => {
        await session.close();
        await driver.close();
    });

    test("Field Node Aggregation alias", async () => {
        const query = `
            query {
                ${typeMovie.plural} {
                    actorsAggregate {
                        node {
                            myName {
                                shortest
                            }
                        }
                    }
                }
            }
        `;

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValuesWithBookmarks(session.lastBookmark()),
        });

        expect(gqlResult.errors).toBeUndefined();
        expect((gqlResult as any).data[typeMovie.plural][0].actorsAggregate).toEqual({
            node: {
                myName: {
                    shortest: "Linda",
                },
            },
        });
    });

    test("Field Edge Aggregation alias", async () => {
        const query = `
            query {
                ${typeMovie.plural} {
                    actorsAggregate {
                        edge {
                            time {
                                max
                            }
                        }
                    }
                }
            }
        `;

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValuesWithBookmarks(session.lastBookmark()),
        });

        expect(gqlResult.errors).toBeUndefined();
        expect((gqlResult as any).data[typeMovie.plural][0].actorsAggregate).toEqual({
            edge: {
                time: {
                    max: 120,
                },
            },
        });
    });
});