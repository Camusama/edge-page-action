export const openApiSchema = {
  openapi: '3.1.0',
  info: {
    title: 'Edge Sync State API',
    description: 'API for managing chatbot page state synchronization and frontend actions',
    version: 'v1.0.0',
  },
  servers: [
    {
      url: 'http://localhost:3050',
      description: 'Local development server',
    },
  ],
  paths: {
    '/api/state/{chatbotId}': {
      get: {
        summary: 'Get chatbot page state',
        description: 'Retrieve the current page state for a specific chatbot',
        operationId: 'getChatbotState',
        parameters: [
          {
            name: 'chatbotId',
            in: 'path',
            description: 'The unique identifier of the chatbot',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Page state retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiResponse',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          $ref: '#/components/schemas/PageState',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '400': {
            description: 'Bad request - chatbotId is required',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/api/action/{chatbotId}': {
      post: {
        summary: 'Send action to chatbot',
        description: 'Send a frontend action to a specific chatbot',
        operationId: 'sendActionToChatbot',
        parameters: [
          {
            name: 'chatbotId',
            in: 'path',
            description: 'The unique identifier of the chatbot',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        requestBody: {
          description: 'Frontend action to send',
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/FrontendActionInput',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Action sent successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/ApiResponse',
                    },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            message: {
                              type: 'string',
                            },
                            sent: {
                              type: 'boolean',
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '400': {
            description: 'Bad request - invalid action or chatbotId',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
          },
          data: {
            type: 'object',
          },
          timestamp: {
            type: 'number',
          },
        },
        required: ['success', 'timestamp'],
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            enum: [false],
          },
          error: {
            type: 'string',
          },
          timestamp: {
            type: 'number',
          },
        },
        required: ['success', 'error', 'timestamp'],
      },
      PageState: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The current page URL',
          },
          title: {
            type: 'string',
            description: 'The current page title',
          },
          timestamp: {
            type: 'number',
            description: 'Timestamp when the state was last updated',
          },
          chatbotId: {
            type: 'string',
            description: 'The unique identifier of the chatbot',
          },
          inputs: {
            type: 'object',
            additionalProperties: true,
            description: 'Form input values',
          },
          forms: {
            type: 'object',
            additionalProperties: true,
            description: 'Form data',
          },
          scrollPosition: {
            type: 'object',
            properties: {
              x: {
                type: 'number',
              },
              y: {
                type: 'number',
              },
            },
            description: 'Current scroll position',
          },
          viewport: {
            type: 'object',
            properties: {
              width: {
                type: 'number',
              },
              height: {
                type: 'number',
              },
            },
            description: 'Viewport dimensions',
          },
          metadata: {
            type: 'object',
            additionalProperties: true,
            description: 'Additional metadata',
          },
          customData: {
            type: 'object',
            additionalProperties: true,
            description: 'Custom data fields',
          },
        },
        required: ['url', 'title', 'timestamp'],
      },

      FrontendActionInput: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['navigate', 'click', 'input', 'scroll', 'custom'],
            description: 'The type of action to perform',
          },
          target: {
            type: 'string',
            description: 'CSS selector or element ID for the target element',
          },
          payload: {
            type: 'object',
            additionalProperties: true,
            description: 'Additional data for the action',
          },
        },
        required: ['type'],
      },
    },
  },
}
