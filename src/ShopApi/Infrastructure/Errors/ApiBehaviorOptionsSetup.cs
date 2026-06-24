using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace ShopApi.Infrastructure.Errors;

public sealed class ApiBehaviorOptionsSetup(
    IApiProblemDetailsFactory problemDetailsFactory)
    : IPostConfigureOptions<ApiBehaviorOptions>
{
    public void PostConfigure(string? name, ApiBehaviorOptions options)
    {
        options.InvalidModelStateResponseFactory = context =>
        {
            var problem = problemDetailsFactory.CreateValidation(
                context.HttpContext,
                context.ModelState);

            return new BadRequestObjectResult(problem);
        };
    }
}
