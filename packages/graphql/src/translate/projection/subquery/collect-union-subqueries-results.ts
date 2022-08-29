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

import type { GraphQLOptionsArg } from "../../../types";
import * as CypherBuilder from "../../cypher-builder/CypherBuilder";
import { addSortAndLimitOptionsToClause } from "./add-sort-and-limit-to-clause";

export function collectUnionSubqueriesResults({
    resultVariable,
    optionsInput,
    isArray,
}: {
    resultVariable: CypherBuilder.Variable;
    optionsInput: GraphQLOptionsArg;
    isArray: boolean;
}): CypherBuilder.Clause {
    const withSortClause = createWithSortAndPaginationClauses(resultVariable, optionsInput);

    let returnProjection = CypherBuilder.collect(resultVariable);
    if (!isArray) {
        returnProjection = CypherBuilder.head(returnProjection);
    }

    const returnClause = new CypherBuilder.Return([returnProjection, resultVariable]);

    return CypherBuilder.concat(withSortClause, returnClause);
}

function createWithSortAndPaginationClauses(
    variable: CypherBuilder.Variable,
    optionsInput: GraphQLOptionsArg
): CypherBuilder.With {
    const withSortClause = new CypherBuilder.With(variable);

    addSortAndLimitOptionsToClause({
        optionsInput,
        target: variable,
        projectionClause: withSortClause,
    });
    return withSortClause;
}